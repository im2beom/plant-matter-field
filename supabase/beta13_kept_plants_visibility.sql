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
