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
