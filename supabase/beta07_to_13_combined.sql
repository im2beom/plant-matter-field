-- RAINFOREST MEMORIES — BETA 07 → 13 combined. Safe to run even if some parts were already applied.
-- Requires the BETA 04 schema, BETA 05 auth repair and BETA 06 social/places SQL to have been applied first.

-- RAINFOREST MEMORIES / BETA 07 — Run once in Supabase SQL Editor
-- AFTER schema_online_beta04.sql, beta05_auth_repair.sql and beta06_social_places.sql.
-- Safe to re-run. Adds:
--   1) Private (hidden) observations: only the author can see them, their likes, comments,
--      identifications and photo.
--   2) A flag for "time unknown" discovery dates.
--   3) Address fields for botanical places (registered by address search).
--   4) A separate plant inventory per place (photo, scientific name, origin, temperature, humidity)
--      with its own private photo bucket.

-- 1. OBSERVATION VISIBILITY ----------------------------------------------------------
alter table public.field_observations add column if not exists is_hidden boolean not null default false;
alter table public.field_observations add column if not exists observed_time_unknown boolean not null default false;
create index if not exists field_observations_photo_path on public.field_observations(photo_path);

drop policy if exists "Invited members read shared observations" on public.field_observations;
create policy "Invited members read shared observations" on public.field_observations
 for select to authenticated
 using (public.is_beta_member() and (is_hidden = false or owner_id = (select auth.uid())));

-- Child rows follow the observation's visibility: the subquery is itself filtered by the policy above.
drop policy if exists "Invited members read identifications" on public.field_identifications;
create policy "Invited members read identifications" on public.field_identifications
 for select to authenticated using (public.is_beta_member() and exists (
  select 1 from public.field_observations o where o.id = field_identifications.observation_id));
drop policy if exists "Invited members suggest identification" on public.field_identifications;
create policy "Invited members suggest identification" on public.field_identifications
 for insert to authenticated with check (public.is_beta_member() and author_id = (select auth.uid()) and exists (
  select 1 from public.field_observations o where o.id = field_identifications.observation_id));

drop policy if exists "Beta members view likes" on public.field_likes;
create policy "Beta members view likes" on public.field_likes
 for select to authenticated using (public.is_beta_member() and exists (
  select 1 from public.field_observations o where o.id = field_likes.observation_id));
drop policy if exists "Beta members add own likes" on public.field_likes;
create policy "Beta members add own likes" on public.field_likes
 for insert to authenticated with check (public.is_beta_member() and user_id = (select auth.uid()) and exists (
  select 1 from public.field_observations o where o.id = field_likes.observation_id));

drop policy if exists "Beta members view comments" on public.field_comments;
create policy "Beta members view comments" on public.field_comments
 for select to authenticated using (public.is_beta_member() and exists (
  select 1 from public.field_observations o where o.id = field_comments.observation_id));
drop policy if exists "Beta members write own comments" on public.field_comments;
create policy "Beta members write own comments" on public.field_comments
 for insert to authenticated with check (public.is_beta_member() and author_id = (select auth.uid()) and exists (
  select 1 from public.field_observations o where o.id = field_comments.observation_id));

-- Observation photos: your own folder, or a photo attached to a visible (not hidden) observation.
drop policy if exists "Beta members read photos" on storage.objects;
create policy "Beta members read photos" on storage.objects for select to authenticated
 using (bucket_id = 'field-photos' and public.is_beta_member() and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or exists (select 1 from public.field_observations o where o.photo_path = objects.name and o.is_hidden = false)
 ));

-- 2/3. BOTANICAL PLACES: ADDRESS -------------------------------------------------------
alter table public.botanical_places add column if not exists address text not null default '';
alter table public.botanical_places add column if not exists address_detail text not null default '';
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'botanical_places_address_length') then
  alter table public.botanical_places add constraint botanical_places_address_length
   check (char_length(address) <= 300 and char_length(address_detail) <= 120);
 end if;
end $$;

-- 4. PLANT INVENTORY PER PLACE ---------------------------------------------------------
create table if not exists public.place_plants (
 id uuid primary key default gen_random_uuid(),
 place_id uuid not null references public.botanical_places(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 scientific_name text not null check (char_length(btrim(scientific_name)) between 1 and 120),
 origin text not null default '' check (char_length(origin) <= 200),
 temp_min double precision check (temp_min between -20 and 60),
 temp_max double precision check (temp_max between -20 and 60),
 humidity_min double precision check (humidity_min between 0 and 100),
 humidity_max double precision check (humidity_max between 0 and 100),
 status text not null default 'available' check (status in ('available','reserved','display')),
 notes text not null default '' check (char_length(notes) <= 500),
 photo_path text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint place_plants_temp_order check (temp_min is null or temp_max is null or temp_min <= temp_max),
 constraint place_plants_humidity_order check (humidity_min is null or humidity_max is null or humidity_min <= humidity_max)
);
create index if not exists place_plants_by_place on public.place_plants(place_id, created_at);
alter table public.place_plants enable row level security;
drop policy if exists "Members view place plants" on public.place_plants;
drop policy if exists "Place owners add plants" on public.place_plants;
drop policy if exists "Place owners edit plants" on public.place_plants;
drop policy if exists "Place owners remove plants" on public.place_plants;
create policy "Members view place plants" on public.place_plants for select to authenticated
 using (public.is_beta_member());
create policy "Place owners add plants" on public.place_plants for insert to authenticated
 with check (public.is_beta_member() and owner_id = (select auth.uid()) and exists (
  select 1 from public.botanical_places p where p.id = place_plants.place_id and p.owner_id = (select auth.uid())));
create policy "Place owners edit plants" on public.place_plants for update to authenticated
 using (public.is_beta_member() and owner_id = (select auth.uid()))
 with check (public.is_beta_member() and owner_id = (select auth.uid()) and exists (
  select 1 from public.botanical_places p where p.id = place_plants.place_id and p.owner_id = (select auth.uid())));
create policy "Place owners remove plants" on public.place_plants for delete to authenticated
 using (public.is_beta_member() and owner_id = (select auth.uid()));
grant select, insert, update, delete on public.place_plants to authenticated;
revoke all on public.place_plants from anon;

-- Private photo bucket for place plants (members read via 1h signed URLs, owners write their own folder).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
 values ('place-photos', 'place-photos', false, 10485760, array['image/jpeg'])
 on conflict (id) do update set public = false;
drop policy if exists "Members read place photos" on storage.objects;
drop policy if exists "Owners add place photos" on storage.objects;
drop policy if exists "Owners update place photos" on storage.objects;
drop policy if exists "Owners remove place photos" on storage.objects;
create policy "Members read place photos" on storage.objects for select to authenticated
 using (bucket_id = 'place-photos' and public.is_beta_member());
create policy "Owners add place photos" on storage.objects for insert to authenticated
 with check (bucket_id = 'place-photos' and public.is_beta_member() and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners update place photos" on storage.objects for update to authenticated
 using (bucket_id = 'place-photos' and public.is_beta_member() and (storage.foldername(name))[1] = (select auth.uid())::text)
 with check (bucket_id = 'place-photos' and public.is_beta_member() and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners remove place photos" on storage.objects for delete to authenticated
 using (bucket_id = 'place-photos' and public.is_beta_member() and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Check: should list is_hidden, observed_time_unknown, address, address_detail and the place_plants table.
-- select column_name from information_schema.columns where table_name in ('field_observations','botanical_places') and column_name in ('is_hidden','observed_time_unknown','address','address_detail');
-- select count(*) from public.place_plants;

-- RAINFOREST MEMORIES / BETA 08 — Run once in Supabase SQL Editor AFTER the BETA 07 SQL.
-- Safe to re-run. Adds:
--   1) Profile photos (avatars bucket + profiles.avatar_path)
--   2) Unique display names (case-insensitive) + availability check
--   3) Member search by name (partial) or exact email
--   4) Identification status for place plants

-- 1. PROFILE PHOTO -------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
 values ('avatars', 'avatars', false, 5242880, array['image/jpeg'])
 on conflict (id) do update set public = false;
drop policy if exists "Members read avatars" on storage.objects;
drop policy if exists "Owners add avatars" on storage.objects;
drop policy if exists "Owners update avatars" on storage.objects;
drop policy if exists "Owners remove avatars" on storage.objects;
create policy "Members read avatars" on storage.objects for select to authenticated
 using (bucket_id = 'avatars' and (public.is_beta_member() or (storage.foldername(name))[1] = (select auth.uid())::text));
create policy "Owners add avatars" on storage.objects for insert to authenticated
 with check (bucket_id = 'avatars' and public.is_beta_member() and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners update avatars" on storage.objects for update to authenticated
 using (bucket_id = 'avatars' and public.is_beta_member() and (storage.foldername(name))[1] = (select auth.uid())::text)
 with check (bucket_id = 'avatars' and public.is_beta_member() and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners remove avatars" on storage.objects for delete to authenticated
 using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 2. UNIQUE DISPLAY NAMES --------------------------------------------------------------
-- Existing duplicates (case-insensitive) are renamed BEFORE the unique index is created:
-- the account that finished setup first keeps the name, later ones get "_" + 5 characters of their id.
with ranked as (
 select id, row_number() over (
  partition by lower(btrim(display_name))
  order by onboarding_completed desc, updated_at asc, id) as rn
 from public.profiles where btrim(display_name) <> ''
)
update public.profiles p
 set display_name = left(btrim(p.display_name), 44) || '_' || substr(replace(p.id::text, '-', ''), 1, 5), updated_at = now()
 from ranked r where r.id = p.id and r.rn > 1;

create unique index if not exists profiles_display_name_unique
 on public.profiles (lower(btrim(display_name))) where btrim(display_name) <> '';

-- New sign-ups no longer get the e-mail prefix as a public name (it would be searchable and could collide).
-- They choose a unique name on the first-time setup screen; the e-mail sign-up form's name is still used if free.
create or replace function public.create_plantmatter_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 30);
begin
 if v_name <> '' and exists (select 1 from public.profiles p where lower(btrim(p.display_name)) = lower(v_name)) then
  v_name := '';
 end if;
 begin
  insert into public.profiles (id, display_name, email_visible, public_email)
  values (new.id, v_name, false, null) on conflict (id) do nothing;
 exception when unique_violation then
  insert into public.profiles (id, display_name, email_visible, public_email)
  values (new.id, '', false, null) on conflict (id) do nothing;
 end;
 return new;
end $$;

create or replace function public.display_name_available(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
 select (select auth.uid()) is not null
  and char_length(btrim(coalesce(p_name, ''))) between 2 and 30
  and position('@' in p_name) = 0
  and not exists (
   select 1 from public.profiles p
   where lower(btrim(p.display_name)) = lower(btrim(p_name)) and p.id <> (select auth.uid()));
$$;
revoke all on function public.display_name_available(text) from public;
grant execute on function public.display_name_available(text) to authenticated;

-- 3. MEMBER SEARCH ----------------------------------------------------------------------
-- Only approved members can search, and only approved members who finished setup are listed.
-- Names match partially; the login e-mail must match exactly and is never returned
-- (only the e-mail the person chose to make public is shown).
drop function if exists public.search_members(text); -- lets this file re-run after BETA 10 changed the columns
create function public.search_members(p_query text)
returns table (id uuid, display_name text, avatar_path text, public_email text, public_phone text)
language sql stable security definer set search_path = '' as $$
 with q as (
  select btrim(coalesce(p_query, '')) as raw,
         replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') as esc
 )
 select p.id, p.display_name, p.avatar_path, p.public_email, p.public_phone
 from public.profiles p
 join auth.users u on u.id = p.id
 cross join q
 where private.is_beta_member()
   and char_length(q.raw) between 2 and 80
   and p.onboarding_completed
   and btrim(p.display_name) <> ''
   and exists (select 1 from public.beta_invites i where lower(i.email) = lower(u.email))
   and (
    p.display_name ilike '%' || q.esc || '%'
    or lower(u.email) = lower(q.raw)
    or (p.email_visible and p.public_email ilike '%' || q.esc || '%')
   )
 order by (lower(p.display_name) = lower(q.raw)) desc, char_length(p.display_name), p.display_name
 limit 20;
$$;
revoke all on function public.search_members(text) from public;
grant execute on function public.search_members(text) to authenticated;

-- 4. PLACE PLANT IDENTIFICATION --------------------------------------------------------
alter table public.place_plants add column if not exists identification_status text not null default 'unidentified';
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'place_plants_identification_status') then
  alter table public.place_plants add constraint place_plants_identification_status
   check (identification_status in ('unidentified', 'verified'));
 end if;
end $$;

notify pgrst, 'reload schema';

-- Check:
-- select column_name from information_schema.columns where table_name='profiles' and column_name='avatar_path';
-- select * from public.search_members('test');   -- run as a signed-in member from the app, not here

-- RAINFOREST MEMORIES / BETA 09 — Run once in Supabase SQL Editor AFTER the BETA 08 SQL.
-- Safe to re-run. Adds:
--   1) Friend requests between approved beta members (a friendship row is visible only to the two people in it).
--   2) Cover photos for botanical places (up to 10, stored in the existing private 'place-photos' bucket).

-- True when the given account is an approved (invited) beta member.
create or replace function private.user_is_beta_member(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (
  select 1 from auth.users u join public.beta_invites i on lower(i.email) = lower(u.email)
  where u.id = p_user);
$$;
revoke all on function private.user_is_beta_member(uuid) from public;
grant execute on function private.user_is_beta_member(uuid) to authenticated;

create table if not exists public.friendships (
 id uuid primary key default gen_random_uuid(),
 requester_id uuid not null references auth.users(id) on delete cascade,
 addressee_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check (status in ('pending', 'accepted')),
 created_at timestamptz not null default now(),
 responded_at timestamptz,
 constraint friendships_not_self check (requester_id <> addressee_id)
);
-- One row per pair, whichever direction the request was sent.
create unique index if not exists friendships_pair_unique
 on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_by_addressee on public.friendships (addressee_id, status);

alter table public.friendships enable row level security;
drop policy if exists "Members see own friendships" on public.friendships;
drop policy if exists "Members send friend requests" on public.friendships;
drop policy if exists "Addressee accepts request" on public.friendships;
drop policy if exists "Either side removes friendship" on public.friendships;
create policy "Members see own friendships" on public.friendships for select to authenticated
 using (public.is_beta_member() and (select auth.uid()) in (requester_id, addressee_id));
create policy "Members send friend requests" on public.friendships for insert to authenticated
 with check (public.is_beta_member() and requester_id = (select auth.uid()) and status = 'pending'
  and responded_at is null and private.user_is_beta_member(addressee_id));
create policy "Addressee accepts request" on public.friendships for update to authenticated
 using (public.is_beta_member() and addressee_id = (select auth.uid()) and status = 'pending')
 with check (addressee_id = (select auth.uid()) and status = 'accepted');
create policy "Either side removes friendship" on public.friendships for delete to authenticated
 using ((select auth.uid()) in (requester_id, addressee_id));

-- Only the status/response time can be changed (never who the request is between).
revoke all on public.friendships from anon, authenticated;
grant select, insert, delete on public.friendships to authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

do $$ begin
 if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships') then
  alter publication supabase_realtime add table public.friendships;
 end if;
end $$;

-- 2. PLACE COVER PHOTOS (ordered; the first one is the cover) ------------------------------
alter table public.botanical_places add column if not exists photo_paths text[] not null default '{}';
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'botanical_places_photo_limit') then
  alter table public.botanical_places add constraint botanical_places_photo_limit
   check (coalesce(array_length(photo_paths, 1), 0) <= 10);
 end if;
end $$;

notify pgrst, 'reload schema';

-- RAINFOREST MEMORIES / BETA 10 — Run once in Supabase SQL Editor AFTER the BETA 09 SQL.
-- Safe to re-run. Adds:
--   1) Account types: personal (collector / grower / explorer) or space operator
--   2) New space categories (shop · greenhouse · culture · research) + personal spaces (region only)
--   3) Discovery ranking (number of shared, non-private finds per member)
--   4) Member search also returns the account type

-- 1. ACCOUNT TYPE ----------------------------------------------------------------------
alter table public.profiles add column if not exists account_type text not null default 'personal';
alter table public.profiles add column if not exists personal_category text;
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'profiles_account_type_check') then
  alter table public.profiles add constraint profiles_account_type_check check (account_type in ('personal', 'operator'));
 end if;
 if not exists (select 1 from pg_constraint where conname = 'profiles_personal_category_check') then
  alter table public.profiles add constraint profiles_personal_category_check
   check (personal_category is null or personal_category in ('collector', 'grower', 'explorer'));
 end if;
end $$;
-- Members who already registered a place are treated as space operators.
update public.profiles p set account_type = 'operator'
 where account_type = 'personal' and exists (select 1 from public.botanical_places b where b.owner_id = p.id and b.kind <> 'personal')
   and not exists (select 1 from pg_constraint where conname = 'botanical_places_kind_v10');

-- 2. SPACE CATEGORIES --------------------------------------------------------------------
-- Earlier kinds (workshop / store / studio) stay valid so existing places keep working.
alter table public.botanical_places drop constraint if exists botanical_places_kind_check;
alter table public.botanical_places drop constraint if exists botanical_places_kind_v10;
alter table public.botanical_places add constraint botanical_places_kind_v10
 check (kind in ('shop', 'greenhouse', 'culture', 'research', 'personal', 'workshop', 'store', 'studio'));
-- Personal spaces never store a detailed address.
alter table public.botanical_places drop constraint if exists personal_place_region_only;
alter table public.botanical_places add constraint personal_place_region_only
 check (kind <> 'personal' or address_detail = '');

-- 3. DISCOVERY RANKING ---------------------------------------------------------------------
create or replace function public.discovery_ranking(p_limit integer default 10)
returns table (owner_id uuid, display_name text, avatar_path text, account_type text, personal_category text, finds bigint, species bigint)
language sql stable security definer set search_path = '' as $$
 select o.owner_id, p.display_name, p.avatar_path, p.account_type, p.personal_category,
        count(*) as finds,
        count(distinct lower(btrim(o.scientific_name))) filter (where btrim(o.scientific_name) not in ('', '미동정 식물')) as species
 from public.field_observations o
 join public.profiles p on p.id = o.owner_id
 join auth.users u on u.id = o.owner_id
 where private.is_beta_member()
   and o.is_hidden = false
   and p.onboarding_completed and btrim(p.display_name) <> ''
   and exists (select 1 from public.beta_invites i where lower(i.email) = lower(u.email))
 group by o.owner_id, p.display_name, p.avatar_path, p.account_type, p.personal_category
 order by finds desc, species desc, min(o.observed_at) asc
 limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;
revoke all on function public.discovery_ranking(integer) from public;
grant execute on function public.discovery_ranking(integer) to authenticated;

-- 4. MEMBER SEARCH (now also returns the account type) ---------------------------------------
drop function if exists public.search_members(text);
create function public.search_members(p_query text)
returns table (id uuid, display_name text, avatar_path text, public_email text, public_phone text, account_type text, personal_category text)
language sql stable security definer set search_path = '' as $$
 with q as (
  select btrim(coalesce(p_query, '')) as raw,
         replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') as esc
 )
 select p.id, p.display_name, p.avatar_path, p.public_email, p.public_phone, p.account_type, p.personal_category
 from public.profiles p
 join auth.users u on u.id = p.id
 cross join q
 where private.is_beta_member()
   and char_length(q.raw) between 2 and 80
   and p.onboarding_completed
   and btrim(p.display_name) <> ''
   and exists (select 1 from public.beta_invites i where lower(i.email) = lower(u.email))
   and (
    p.display_name ilike '%' || q.esc || '%'
    or lower(u.email) = lower(q.raw)
    or (p.email_visible and p.public_email ilike '%' || q.esc || '%')
   )
 order by (lower(p.display_name) = lower(q.raw)) desc, char_length(p.display_name), p.display_name
 limit 20;
$$;
revoke all on function public.search_members(text) from public;
grant execute on function public.search_members(text) to authenticated;

notify pgrst, 'reload schema';

-- RAINFOREST MEMORIES / BETA 11 — Run once in Supabase SQL Editor AFTER the BETA 10 SQL.
-- Safe to re-run. Adds up to 5 plant photos + 2 habitat photos per observation.
-- photo_path stays the cover (first plant photo) so earlier app versions keep working.

alter table public.field_observations add column if not exists photo_paths text[] not null default '{}';
alter table public.field_observations add column if not exists habitat_photo_paths text[] not null default '{}';
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'field_observations_photo_limits') then
  alter table public.field_observations add constraint field_observations_photo_limits
   check (coalesce(array_length(photo_paths, 1), 0) <= 5 and coalesce(array_length(habitat_photo_paths, 1), 0) <= 2);
 end if;
end $$;
create index if not exists field_observations_photo_paths on public.field_observations using gin (photo_paths);
create index if not exists field_observations_habitat_photo_paths on public.field_observations using gin (habitat_photo_paths);
-- Existing single photos become the first entry of the new list.
update public.field_observations set photo_paths = array[photo_path]
 where photo_path is not null and coalesce(array_length(photo_paths, 1), 0) = 0;

-- Photos are readable in your own folder, or when attached to an observation that is not private.
drop policy if exists "Beta members read photos" on storage.objects;
create policy "Beta members read photos" on storage.objects for select to authenticated
 using (bucket_id = 'field-photos' and public.is_beta_member() and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or exists (select 1 from public.field_observations o where o.is_hidden = false and (
   o.photo_path = objects.name or o.photo_paths @> array[objects.name] or o.habitat_photo_paths @> array[objects.name]))
 ));

notify pgrst, 'reload schema';

-- RAINFOREST MEMORIES / BETA 12 — Run once in Supabase SQL Editor AFTER the BETA 11 SQL.
-- Safe to re-run. Adds:
--   1) Owner-only observation details (place name, field number, observer, …) so they are never lost on edit
--   2) Country code for "approximate" records (shown at the country centre) + expedition link
--   3) Up to 5 photos per kept plant
--   4) One-step switch from space operator to personal account (deletes operator places atomically)
--   5) Public expeditions (route, optional GPS track) — private expeditions never leave the device

-- 1. OWNER-ONLY OBSERVATION DETAILS ------------------------------------------------------
create table if not exists public.field_private_details (
 observation_id text primary key references public.field_observations(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 locality text check (char_length(locality) <= 200),
 field_number text check (char_length(field_number) <= 120),
 collector text check (char_length(collector) <= 200),
 population text check (char_length(population) <= 300),
 associated_species text check (char_length(associated_species) <= 500),
 voucher text check (char_length(voucher) <= 300),
 location_source text check (char_length(location_source) <= 20),
 updated_at timestamptz not null default now()
);
alter table public.field_private_details enable row level security;
drop policy if exists "Owner reads private details" on public.field_private_details;
drop policy if exists "Owner writes private details" on public.field_private_details;
drop policy if exists "Owner updates private details" on public.field_private_details;
drop policy if exists "Owner deletes private details" on public.field_private_details;
create policy "Owner reads private details" on public.field_private_details for select to authenticated
 using (owner_id = (select auth.uid()));
create policy "Owner writes private details" on public.field_private_details for insert to authenticated
 with check (owner_id = (select auth.uid()) and exists (
  select 1 from public.field_observations o where o.id = field_private_details.observation_id and o.owner_id = (select auth.uid())));
create policy "Owner updates private details" on public.field_private_details for update to authenticated
 using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "Owner deletes private details" on public.field_private_details for delete to authenticated
 using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.field_private_details to authenticated;
revoke all on public.field_private_details from anon;

-- 2. COUNTRY CODE + EXPEDITION LINK --------------------------------------------------------
alter table public.field_observations add column if not exists country_code text;
alter table public.field_observations add column if not exists expedition_id text;
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'field_observations_country_code') then
  alter table public.field_observations add constraint field_observations_country_code
   check (country_code is null or country_code ~ '^[A-Z]{2}$');
 end if;
end $$;
create index if not exists field_observations_by_expedition on public.field_observations(expedition_id) where expedition_id is not null;

-- 3. KEPT PLANT PHOTOS (first = cover; photo_path stays the cover for older app versions) ---------
alter table public.place_plants add column if not exists photo_paths text[] not null default '{}';
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'place_plants_photo_limit') then
  alter table public.place_plants add constraint place_plants_photo_limit check (coalesce(array_length(photo_paths, 1), 0) <= 5);
 end if;
end $$;
update public.place_plants set photo_paths = array[photo_path]
 where photo_path is not null and coalesce(array_length(photo_paths, 1), 0) = 0;

-- 4. OPERATOR → PERSONAL (all-or-nothing) ---------------------------------------------------
-- Deletes the caller's non-personal places (their kept plants cascade) and switches the account
-- in one transaction. Returns the storage paths of the deleted photos so the app can remove the files.
create or replace function public.switch_to_personal_account()
returns text[] language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_paths text[];
begin
 if v_uid is null then raise exception 'login required'; end if;
 select coalesce(array_agg(distinct x), '{}') into v_paths from (
  select unnest(b.photo_paths) as x from public.botanical_places b where b.owner_id = v_uid and b.kind <> 'personal'
  union all
  select unnest(pp.photo_paths || case when pp.photo_path is null then '{}'::text[] else array[pp.photo_path] end)
   from public.place_plants pp join public.botanical_places b on b.id = pp.place_id
   where b.owner_id = v_uid and b.kind <> 'personal'
 ) s where x is not null;
 delete from public.botanical_places where owner_id = v_uid and kind <> 'personal';
 update public.profiles set account_type = 'personal', updated_at = now() where id = v_uid;
 return v_paths;
end $$;
revoke all on function public.switch_to_personal_account() from public;
grant execute on function public.switch_to_personal_account() to authenticated;

-- 5. PUBLIC EXPEDITIONS -----------------------------------------------------------------------
-- A row exists only while the owner has made the expedition public. track is present only when
-- the owner also chose to share the GPS track (simplified to ≤ 2,500 points).
create table if not exists public.expeditions (
 id text primary key check (id ~ '^EXP-[0-9A-Za-z-]+$'),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 90),
 country text not null default '' check (char_length(country) <= 80),
 locality text not null default '' check (char_length(locality) <= 120),
 started_on date,
 ended_on date,
 stops jsonb not null default '[]'::jsonb check (jsonb_typeof(stops) = 'array' and jsonb_array_length(stops) <= 200),
 track jsonb check (track is null or (jsonb_typeof(track) = 'array' and jsonb_array_length(track) <= 2500)),
 updated_at timestamptz not null default now()
);
create index if not exists expeditions_by_owner on public.expeditions(owner_id);
alter table public.expeditions enable row level security;
drop policy if exists "Members view public expeditions" on public.expeditions;
drop policy if exists "Owners publish expeditions" on public.expeditions;
drop policy if exists "Owners update expeditions" on public.expeditions;
drop policy if exists "Owners remove expeditions" on public.expeditions;
create policy "Members view public expeditions" on public.expeditions for select to authenticated
 using (public.is_beta_member());
create policy "Owners publish expeditions" on public.expeditions for insert to authenticated
 with check (public.is_beta_member() and owner_id = (select auth.uid()));
create policy "Owners update expeditions" on public.expeditions for update to authenticated
 using (owner_id = (select auth.uid())) with check (public.is_beta_member() and owner_id = (select auth.uid()));
create policy "Owners remove expeditions" on public.expeditions for delete to authenticated
 using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.expeditions to authenticated;
revoke all on public.expeditions from anon;

notify pgrst, 'reload schema';

-- RAINFOREST MEMORIES / BETA 13 — Run once in Supabase SQL Editor AFTER the BETA 12 SQL.
-- Safe to re-run. Adds:
--   1) Kept plants without a space ("no space", place_id is null). Deleting a space no longer
--      deletes its kept plants: they move to "no space".
--   2) Public / private kept plants. A private kept plant and its photos are visible only to the owner.
--   3) Space photos are readable only when they belong to a visible kept plant or a space
--      (or are in your own folder).
--   4) Switching from space operator to personal keeps the kept plants (moved to "no space").

-- 1. KEPT PLANTS WITHOUT A SPACE ---------------------------------------------------------------
alter table public.place_plants alter column place_id drop not null;
do $$ declare c record; begin
 -- Replace the old "on delete cascade" link with "on delete set null" (whatever its name is).
 for c in select conname from pg_constraint
  where conrelid = 'public.place_plants'::regclass and contype = 'f'
   and confrelid = 'public.botanical_places'::regclass and confdeltype <> 'n' loop
  execute format('alter table public.place_plants drop constraint %I', c.conname);
 end loop;
 if not exists (select 1 from pg_constraint where conrelid = 'public.place_plants'::regclass and contype = 'f'
   and confrelid = 'public.botanical_places'::regclass) then
  alter table public.place_plants add constraint place_plants_place_id_fkey
   foreign key (place_id) references public.botanical_places(id) on delete set null;
 end if;
end $$;
create index if not exists place_plants_by_owner on public.place_plants(owner_id, created_at);

-- 2. PUBLIC / PRIVATE KEPT PLANTS --------------------------------------------------------------
alter table public.place_plants add column if not exists is_hidden boolean not null default false;
drop policy if exists "Members view place plants" on public.place_plants;
drop policy if exists "Place owners add plants" on public.place_plants;
drop policy if exists "Place owners edit plants" on public.place_plants;
create policy "Members view place plants" on public.place_plants for select to authenticated
 using (public.is_beta_member() and (is_hidden = false or owner_id = (select auth.uid())));
create policy "Place owners add plants" on public.place_plants for insert to authenticated
 with check (public.is_beta_member() and owner_id = (select auth.uid()) and (place_id is null or exists (
  select 1 from public.botanical_places p where p.id = place_plants.place_id and p.owner_id = (select auth.uid()))));
create policy "Place owners edit plants" on public.place_plants for update to authenticated
 using (public.is_beta_member() and owner_id = (select auth.uid()))
 with check (public.is_beta_member() and owner_id = (select auth.uid()) and (place_id is null or exists (
  select 1 from public.botanical_places p where p.id = place_plants.place_id and p.owner_id = (select auth.uid()))));

-- 3. SPACE PHOTOS FOLLOW THE VISIBILITY OF WHAT THEY BELONG TO ---------------------------------
create index if not exists place_plants_photo_path on public.place_plants(photo_path);
create index if not exists place_plants_photo_paths on public.place_plants using gin (photo_paths);
create index if not exists botanical_places_photo_paths on public.botanical_places using gin (photo_paths);
drop policy if exists "Members read place photos" on storage.objects;
create policy "Members read place photos" on storage.objects for select to authenticated
 using (bucket_id = 'place-photos' and public.is_beta_member() and (
  (storage.foldername(name))[1] = (select auth.uid())::text
  or exists (select 1 from public.place_plants pp where pp.is_hidden = false
   and (pp.photo_path = objects.name or pp.photo_paths @> array[objects.name]))
  or exists (select 1 from public.botanical_places b where b.photo_paths @> array[objects.name])
 ));

-- 4. OPERATOR → PERSONAL (all-or-nothing, kept plants stay) -------------------------------------
-- Deletes the caller's non-personal places and switches the account in one transaction.
-- Kept plants in those places move to "no space". Returns the deleted cover photo paths
-- so the app can remove the files.
create or replace function public.switch_to_personal_account()
returns text[] language plpgsql security invoker set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_paths text[];
begin
 if v_uid is null then raise exception 'login required'; end if;
 select coalesce(array_agg(distinct x), '{}') into v_paths from (
  select unnest(b.photo_paths) as x from public.botanical_places b where b.owner_id = v_uid and b.kind <> 'personal'
 ) s where x is not null;
 update public.place_plants set place_id = null, updated_at = now()
  where owner_id = v_uid and place_id in (
   select b.id from public.botanical_places b where b.owner_id = v_uid and b.kind <> 'personal');
 delete from public.botanical_places where owner_id = v_uid and kind <> 'personal';
 update public.profiles set account_type = 'personal', updated_at = now() where id = v_uid;
 return v_paths;
end $$;
revoke all on function public.switch_to_personal_account() from public;
grant execute on function public.switch_to_personal_account() to authenticated;

notify pgrst, 'reload schema';

-- Check (should return: true / true / n):
-- select is_nullable = 'YES' from information_schema.columns where table_schema = 'public' and table_name = 'place_plants' and column_name = 'place_id';
-- select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'place_plants' and column_name = 'is_hidden');
-- select confdeltype from pg_constraint where conrelid = 'public.place_plants'::regclass and contype = 'f' and confrelid = 'public.botanical_places'::regclass;
