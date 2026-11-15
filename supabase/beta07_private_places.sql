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
