-- RAINFOREST MEMORIES / BETA 06 — Run once in Supabase SQL Editor after BETA05 repair.
-- Likes and comments are visible ONLY to approved beta members. No exact wild-plant
-- GPS is copied to these tables. Businesses VOLUNTARILY publish their venue coordinates.

create table if not exists public.field_likes (
 observation_id text not null references public.field_observations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (observation_id, user_id)
);
alter table public.field_likes enable row level security;
drop policy if exists "Beta members view likes" on public.field_likes;
drop policy if exists "Beta members add own likes" on public.field_likes;
drop policy if exists "Members remove own likes" on public.field_likes;
create policy "Beta members view likes" on public.field_likes for select to authenticated using (public.is_beta_member());
create policy "Beta members add own likes" on public.field_likes for insert to authenticated
 with check (public.is_beta_member() and user_id=(select auth.uid()));
create policy "Members remove own likes" on public.field_likes for delete to authenticated
 using (public.is_beta_member() and user_id=(select auth.uid()));

grant select,insert,delete on public.field_likes to authenticated;
revoke all on public.field_likes from anon;

create table if not exists public.field_comments (
 id uuid primary key default gen_random_uuid(),
 observation_id text not null references public.field_observations(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(btrim(body)) between 1 and 500),
 created_at timestamptz not null default now()
);
create index if not exists field_comments_by_observation on public.field_comments (observation_id,created_at desc);
alter table public.field_comments enable row level security;
drop policy if exists "Beta members view comments" on public.field_comments;
drop policy if exists "Beta members write own comments" on public.field_comments;
drop policy if exists "Authors delete own comments" on public.field_comments;
create policy "Beta members view comments" on public.field_comments for select to authenticated using (public.is_beta_member());
create policy "Beta members write own comments" on public.field_comments for insert to authenticated
 with check (public.is_beta_member() and author_id=(select auth.uid()));
create policy "Authors delete own comments" on public.field_comments for delete to authenticated
 using (public.is_beta_member() and author_id=(select auth.uid()));
grant select,insert,delete on public.field_comments to authenticated;
revoke all on public.field_comments from anon;

-- These pins are self-submitted public venues, distinct from private wild-plant observations.
create table if not exists public.botanical_places (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 2 and 100),
 kind text not null check (kind in ('workshop','store','studio')),
 country text not null default '',
 locality text not null default '',
 description text not null default '' check (char_length(description)<=500),
 plants text not null default '' check (char_length(plants)<=1500),
 latitude double precision not null check (latitude between -85 and 85),
 longitude double precision not null check (longitude between -180 and 180),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists botanical_places_by_owner on public.botanical_places(owner_id);
alter table public.botanical_places enable row level security;
drop policy if exists "Approved members view botanical places" on public.botanical_places;
drop policy if exists "Owners add botanical places" on public.botanical_places;
drop policy if exists "Owners edit botanical places" on public.botanical_places;
drop policy if exists "Owners remove botanical places" on public.botanical_places;
create policy "Approved members view botanical places" on public.botanical_places for select to authenticated
 using (public.is_beta_member());
create policy "Owners add botanical places" on public.botanical_places for insert to authenticated
 with check (public.is_beta_member() and owner_id=(select auth.uid()));
create policy "Owners edit botanical places" on public.botanical_places for update to authenticated
 using (public.is_beta_member() and owner_id=(select auth.uid()))
 with check (public.is_beta_member() and owner_id=(select auth.uid()));
create policy "Owners remove botanical places" on public.botanical_places for delete to authenticated
 using (public.is_beta_member() and owner_id=(select auth.uid()));
grant select,insert,update,delete on public.botanical_places to authenticated;
revoke all on public.botanical_places from anon;

-- Optional realtime: if your project is on a free plan, simple reload is enough.
do $$ begin
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='field_likes') then
  alter publication supabase_realtime add table public.field_likes;
 end if;
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='field_comments') then
  alter publication supabase_realtime add table public.field_comments;
 end if;
 if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='botanical_places') then
  alter publication supabase_realtime add table public.botanical_places;
 end if;
end $$;
