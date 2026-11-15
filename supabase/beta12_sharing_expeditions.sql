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
