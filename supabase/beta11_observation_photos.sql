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
