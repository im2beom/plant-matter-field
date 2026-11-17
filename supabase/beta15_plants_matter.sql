-- RAINFOREST MEMORIES / BETA 15 — Run once in Supabase SQL Editor AFTER the BETA 13 SQL (BETA 14 had no SQL).
-- Safe to re-run. Adds:
--   1) Plant categories for "My Plants" (optional sub-categories, two levels)
--   2) Kept plant fields: category, origin (broad region → country / island), seed and pollen parents
--   3) App administrators (the accounts that may post events and shops)
--   4) MATTER: events and shops — anyone can read them, only administrators can write
--   5) Public photo storage for event posters and shop photos (administrators upload)
-- Nothing is deleted: places, expeditions and coordinates stay in the database, the app just no longer shows them.

-- 1. PLANT CATEGORIES -----------------------------------------------------------------------
create table if not exists public.plant_categories (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 parent_id uuid references public.plant_categories(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 40),
 sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
create index if not exists plant_categories_by_owner on public.plant_categories(owner_id, sort_order);
alter table public.plant_categories enable row level security;
drop policy if exists "Members view plant categories" on public.plant_categories;
drop policy if exists "Owners add plant categories" on public.plant_categories;
drop policy if exists "Owners edit plant categories" on public.plant_categories;
drop policy if exists "Owners remove plant categories" on public.plant_categories;
create policy "Members view plant categories" on public.plant_categories for select to authenticated
 using (public.is_beta_member());
-- A sub-category must hang under one of your own top-level categories (two levels at most).
create policy "Owners add plant categories" on public.plant_categories for insert to authenticated
 with check (public.is_beta_member() and owner_id = (select auth.uid()) and (parent_id is null or exists (
  select 1 from public.plant_categories p where p.id = plant_categories.parent_id and p.owner_id = (select auth.uid()) and p.parent_id is null)));
create policy "Owners edit plant categories" on public.plant_categories for update to authenticated
 using (owner_id = (select auth.uid()))
 with check (owner_id = (select auth.uid()) and (parent_id is null or exists (
  select 1 from public.plant_categories p where p.id = plant_categories.parent_id and p.owner_id = (select auth.uid()) and p.parent_id is null)));
create policy "Owners remove plant categories" on public.plant_categories for delete to authenticated
 using (owner_id = (select auth.uid()));
grant select, insert, update, delete on public.plant_categories to authenticated;
revoke all on public.plant_categories from anon;

-- 2. KEPT PLANT FIELDS ------------------------------------------------------------------------
alter table public.place_plants add column if not exists category_id uuid references public.plant_categories(id) on delete set null;
alter table public.place_plants add column if not exists origin_region text;
alter table public.place_plants add column if not exists origin_place text;
alter table public.place_plants add column if not exists seed_parent_id uuid references public.place_plants(id) on delete set null;
alter table public.place_plants add column if not exists seed_parent_name text;
alter table public.place_plants add column if not exists pollen_parent_id uuid references public.place_plants(id) on delete set null;
alter table public.place_plants add column if not exists pollen_parent_name text;
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'place_plants_beta15_fields') then
  alter table public.place_plants add constraint place_plants_beta15_fields check (
   (origin_region is null or origin_region ~ '^[a-z_]{2,30}$')
   and (origin_place is null or char_length(origin_place) <= 40)
   and (seed_parent_name is null or char_length(seed_parent_name) <= 160)
   and (pollen_parent_name is null or char_length(pollen_parent_name) <= 160));
 end if;
end $$;
create index if not exists place_plants_by_category on public.place_plants(category_id) where category_id is not null;
-- Kept plants: your own category and your own parent plants only (BETA 13 rules otherwise unchanged).
-- (A policy on place_plants cannot query place_plants itself, so parent ownership goes through this function.)
create or replace function public.owns_place_plant(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.place_plants p where p.id = p_id and p.owner_id = (select auth.uid()));
$$;
revoke all on function public.owns_place_plant(uuid) from public;
grant execute on function public.owns_place_plant(uuid) to authenticated;
drop policy if exists "Place owners add plants" on public.place_plants;
drop policy if exists "Place owners edit plants" on public.place_plants;
create policy "Place owners add plants" on public.place_plants for insert to authenticated
 with check (public.is_beta_member() and owner_id = (select auth.uid())
  and (place_id is null or exists (select 1 from public.botanical_places p where p.id = place_plants.place_id and p.owner_id = (select auth.uid())))
  and (category_id is null or exists (select 1 from public.plant_categories c where c.id = place_plants.category_id and c.owner_id = (select auth.uid())))
  and (seed_parent_id is null or public.owns_place_plant(seed_parent_id))
  and (pollen_parent_id is null or public.owns_place_plant(pollen_parent_id)));
create policy "Place owners edit plants" on public.place_plants for update to authenticated
 using (public.is_beta_member() and owner_id = (select auth.uid()))
 with check (public.is_beta_member() and owner_id = (select auth.uid())
  and (place_id is null or exists (select 1 from public.botanical_places p where p.id = place_plants.place_id and p.owner_id = (select auth.uid())))
  and (category_id is null or exists (select 1 from public.plant_categories c where c.id = place_plants.category_id and c.owner_id = (select auth.uid())))
  and (seed_parent_id is null or public.owns_place_plant(seed_parent_id))
  and (pollen_parent_id is null or public.owns_place_plant(pollen_parent_id)));

-- 3. ADMINISTRATORS ---------------------------------------------------------------------------
-- Managed here in the SQL editor only (no API access). See the line at the end to add yourself.
create table if not exists public.app_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;
create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to anon, authenticated;

-- 4. EVENTS AND SHOPS (MATTER) -------------------------------------------------------------------
create table if not exists public.matter_events (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(btrim(title)) between 1 and 80),
 subtitle text not null default '' check (char_length(subtitle) <= 80),
 starts_on date not null,
 ends_on date,
 venue text not null default '' check (char_length(venue) <= 160),
 description text not null default '' check (char_length(description) <= 2000),
 link_url text not null default '' check (link_url = '' or (link_url ~* '^https?://' and char_length(link_url) <= 500)),
 poster_paths text[] not null default '{}' check (coalesce(array_length(poster_paths, 1), 0) <= 6),
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint matter_events_dates check (ends_on is null or ends_on >= starts_on)
);
create index if not exists matter_events_by_date on public.matter_events(starts_on);
create table if not exists public.matter_shops (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 1 and 80),
 kind text not null default 'shop' check (kind in ('shop','showroom','greenhouse','other')),
 area text not null default '' check (char_length(area) <= 80),
 address text not null default '' check (char_length(address) <= 200),
 hours text not null default '' check (char_length(hours) <= 200),
 phone text not null default '' check (char_length(phone) <= 40),
 instagram text not null default '' check (char_length(instagram) <= 80),
 website text not null default '' check (website = '' or (website ~* '^https?://' and char_length(website) <= 300)),
 description text not null default '' check (char_length(description) <= 2000),
 photo_paths text[] not null default '{}' check (coalesce(array_length(photo_paths, 1), 0) <= 10),
 sort_order integer not null default 0,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.matter_events enable row level security;
alter table public.matter_shops enable row level security;
drop policy if exists "Anyone reads events" on public.matter_events;
drop policy if exists "Admins add events" on public.matter_events;
drop policy if exists "Admins edit events" on public.matter_events;
drop policy if exists "Admins remove events" on public.matter_events;
create policy "Anyone reads events" on public.matter_events for select to anon, authenticated using (true);
create policy "Admins add events" on public.matter_events for insert to authenticated with check (public.is_app_admin());
create policy "Admins edit events" on public.matter_events for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Admins remove events" on public.matter_events for delete to authenticated using (public.is_app_admin());
drop policy if exists "Anyone reads shops" on public.matter_shops;
drop policy if exists "Admins add shops" on public.matter_shops;
drop policy if exists "Admins edit shops" on public.matter_shops;
drop policy if exists "Admins remove shops" on public.matter_shops;
create policy "Anyone reads shops" on public.matter_shops for select to anon, authenticated using (true);
create policy "Admins add shops" on public.matter_shops for insert to authenticated with check (public.is_app_admin());
create policy "Admins edit shops" on public.matter_shops for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy "Admins remove shops" on public.matter_shops for delete to authenticated using (public.is_app_admin());
grant select on public.matter_events, public.matter_shops to anon, authenticated;
grant insert, update, delete on public.matter_events, public.matter_shops to authenticated;

-- 5. PUBLIC STORAGE FOR POSTERS AND SHOP PHOTOS ---------------------------------------------------
-- A public bucket: files can be opened by their URL without signing in. Only administrators can upload.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
 values ('matter-media', 'matter-media', true, 10485760, array['image/jpeg'])
 on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "Anyone reads matter media" on storage.objects;
drop policy if exists "Admins add matter media" on storage.objects;
drop policy if exists "Admins update matter media" on storage.objects;
drop policy if exists "Admins remove matter media" on storage.objects;
create policy "Anyone reads matter media" on storage.objects for select to anon, authenticated
 using (bucket_id = 'matter-media');
create policy "Admins add matter media" on storage.objects for insert to authenticated
 with check (bucket_id = 'matter-media' and public.is_app_admin());
create policy "Admins update matter media" on storage.objects for update to authenticated
 using (bucket_id = 'matter-media' and public.is_app_admin()) with check (bucket_id = 'matter-media' and public.is_app_admin());
create policy "Admins remove matter media" on storage.objects for delete to authenticated
 using (bucket_id = 'matter-media' and public.is_app_admin());

notify pgrst, 'reload schema';

-- MAKE YOURSELF AN ADMINISTRATOR: replace the address with the e-mail you log in with, then run this one line.
-- insert into public.app_admins (user_id) select id from auth.users where lower(email) = lower('YOUR_LOGIN_EMAIL') on conflict do nothing;
-- Check (should list your account):
-- select u.email from public.app_admins a join auth.users u on u.id = a.user_id;
