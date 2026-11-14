-- PLANT MATTER RAINFOREST MEMORIES — BETA 04, invite-only online beta.
-- Run in Supabase SQL Editor as project owner. Never paste service role keys into config.js.
-- This migration also replaces BETA03's overly broad profile read policy.

create table if not exists public.beta_invites (
 email text primary key,
 invited_at timestamptz not null default now()
);
alter table public.beta_invites enable row level security;
-- No public read/write policy: only administrators can manage invitations via SQL Editor.
revoke all on public.beta_invites from anon, authenticated;

create schema if not exists private;

create or replace function private.is_beta_member()
returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.beta_invites i where lower(i.email) = lower(auth.jwt() ->> 'email')
 );
$$;
revoke all on function private.is_beta_member() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_beta_member() to authenticated;
-- The public-facing wrapper is deliberately invoker-only; definer access is confined to private schema.
create or replace function public.is_beta_member()
returns boolean language sql stable security invoker set search_path = '' as $$
 select private.is_beta_member();
$$;
revoke all on function public.is_beta_member() from public;
grant execute on function public.is_beta_member() to authenticated;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '',
 email_visible boolean not null default false,
 public_email text,
 updated_at timestamptz not null default now(),
 constraint display_name_length check (char_length(display_name) <= 50)
);
alter table public.profiles enable row level security;
drop policy if exists "Anyone can view public profiles" on public.profiles;
drop policy if exists "Owners can update profiles" on public.profiles;
drop policy if exists "Owners can insert profiles" on public.profiles;
drop policy if exists "Beta members view profiles" on public.profiles;
create policy "Beta members view profiles" on public.profiles for select to authenticated
 using (public.is_beta_member() or id=(select auth.uid()));
create policy "Owners can update profiles" on public.profiles for update to authenticated
 using (id=(select auth.uid())) with check (id=(select auth.uid()));
create policy "Owners can insert profiles" on public.profiles for insert to authenticated
 with check (id=(select auth.uid()));

create or replace function public.create_plantmatter_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles (id, display_name, email_visible, public_email)
 values (new.id,
 left(coalesce(new.raw_user_meta_data ->> 'display_name',split_part(new.email,'@',1),'Member'),50),
 coalesce((new.raw_user_meta_data ->> 'email_visible')::boolean,false),
 case when coalesce((new.raw_user_meta_data ->> 'email_visible')::boolean,false) then new.email else null end)
 on conflict (id) do nothing;
 return new;
end $$;
drop trigger if exists on_plantmatter_user_created on auth.users;
create trigger on_plantmatter_user_created after insert on auth.users
 for each row execute function public.create_plantmatter_profile();

create table if not exists public.field_observations (
 id text primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 scientific_name text not null,
 family text,
 country text,
 locality text,
 latitude double precision,
 longitude double precision,
 privacy text not null default 'private' check (privacy in ('private','coarse','public')),
 elevation double precision,
 habitat text, habit text, substrate text, phenology text,
 lux double precision, ppfd double precision, temperature double precision, humidity double precision,
 observed_at timestamptz not null default now(),
 notes text,
 identification_status text not null default 'unidentified',
 measurement_source text, measurement_device text, measured_at text,
 photo_path text,
 updated_at timestamptz not null default now(),
 constraint world_lat check (latitude is null or latitude between -90 and 90),
 constraint world_lon check (longitude is null or longitude between -180 and 180),
 constraint no_private_map_location check (privacy <> 'private' or (latitude is null and longitude is null)),
 constraint valid_pair check ((latitude is null) = (longitude is null)),
 constraint coarse_grid_only check (privacy <> 'coarse' or latitude is null or
   (abs((latitude - floor(latitude)) - 0.5)<0.00001 and abs((longitude - floor(longitude)) - 0.5)<0.00001))
);
alter table public.field_observations enable row level security;
create policy "Invited members read shared observations" on public.field_observations
 for select to authenticated using (public.is_beta_member());
create policy "Invited authors insert observations" on public.field_observations
 for insert to authenticated with check (public.is_beta_member() and owner_id=(select auth.uid()));
create policy "Authors update own observations" on public.field_observations
 for update to authenticated using (public.is_beta_member() and owner_id=(select auth.uid()))
 with check (public.is_beta_member() and owner_id=(select auth.uid()));
create policy "Authors delete own observations" on public.field_observations
 for delete to authenticated using (public.is_beta_member() and owner_id=(select auth.uid()));

-- Unobfuscated GPS stored ONLY here; no read policy for other beta members.
create table if not exists public.field_private_locations (
 observation_id text primary key references public.field_observations(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 latitude double precision not null check (latitude between -90 and 90),
 longitude double precision not null check (longitude between -180 and 180),
 gps_accuracy double precision
);
alter table public.field_private_locations enable row level security;
create policy "Own precise locations only read" on public.field_private_locations
 for select to authenticated using (public.is_beta_member() and owner_id=(select auth.uid()));
create policy "Own precise locations only insert" on public.field_private_locations
 for insert to authenticated with check (
  public.is_beta_member() and owner_id=(select auth.uid()) and
  exists(select 1 from public.field_observations o where o.id=observation_id and o.owner_id=(select auth.uid()))
 );
create policy "Own precise locations only update" on public.field_private_locations
 for update to authenticated using (public.is_beta_member() and owner_id=(select auth.uid()))
 with check (public.is_beta_member() and owner_id=(select auth.uid()));
create policy "Own precise locations only delete" on public.field_private_locations
 for delete to authenticated using (public.is_beta_member() and owner_id=(select auth.uid()));

create table if not exists public.field_identifications (
 id uuid primary key default gen_random_uuid(),
 observation_id text not null references public.field_observations(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 proposed_name text not null check (char_length(proposed_name) between 1 and 120),
 created_at timestamptz not null default now()
);
alter table public.field_identifications enable row level security;
create policy "Invited members read identifications" on public.field_identifications
 for select to authenticated using (public.is_beta_member());
create policy "Invited members suggest identification" on public.field_identifications
 for insert to authenticated with check (public.is_beta_member() and author_id=(select auth.uid()));

-- Private bucket: access requires an invited account, signed URLs valid for 1h.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
 values ('field-photos','field-photos',false,10485760,array['image/jpeg'])
 on conflict (id) do update set public=false;
drop policy if exists "Beta members read photos" on storage.objects;
drop policy if exists "Owners add photos" on storage.objects;
drop policy if exists "Owners update photos" on storage.objects;
drop policy if exists "Owners remove photos" on storage.objects;
create policy "Beta members read photos" on storage.objects for select to authenticated
 using (bucket_id='field-photos' and public.is_beta_member());
create policy "Owners add photos" on storage.objects for insert to authenticated
 with check (bucket_id='field-photos' and public.is_beta_member() and
 (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Owners update photos" on storage.objects for update to authenticated
 using (bucket_id='field-photos' and public.is_beta_member() and (storage.foldername(name))[1]=(select auth.uid())::text)
 with check (bucket_id='field-photos' and public.is_beta_member() and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Owners remove photos" on storage.objects for delete to authenticated
 using (bucket_id='field-photos' and public.is_beta_member() and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Realtime for small invited pilot. Postgres Changes need table in publication.
do $$ begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='field_observations') then
  alter publication supabase_realtime add table public.field_observations;
 end if;
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='field_identifications') then
  alter publication supabase_realtime add table public.field_identifications;
 end if;
end $$;

-- Explicit grants (RLS policies still restrict rows).
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.field_observations to authenticated;
grant select, insert, update, delete on public.field_private_locations to authenticated;
grant select, insert on public.field_identifications to authenticated;
revoke all on public.profiles,public.field_observations,public.field_private_locations,public.field_identifications from anon;

-- After signing up, invite by email using the Supabase SQL Editor (not the browser):
-- insert into public.beta_invites(email) values ('tester@example.com') on conflict do nothing;
-- Remove access: delete from public.beta_invites where email = 'tester@example.com';
-- IMPORTANT: user sign-up itself is permitted by Auth; beta_invites limits shared DATA access.
