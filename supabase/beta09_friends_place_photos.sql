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
