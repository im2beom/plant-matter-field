-- PLANT MATTER RAINFOREST MEMORIES BETA 03
-- Run in Supabase SQL Editor. No email/password values are stored in public tables.
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
create policy "Anyone can view public profiles" on public.profiles for select using (true);
drop policy if exists "Owners can update profiles" on public.profiles;
create policy "Owners can update profiles" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "Owners can insert profiles" on public.profiles;
create policy "Owners can insert profiles" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);

create or replace function public.create_plantmatter_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into public.profiles (id, display_name, email_visible, public_email)
 values (new.id,
   left(coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email,'@',1), 'Member'),50),
   coalesce((new.raw_user_meta_data ->> 'email_visible')::boolean,false),
   case when coalesce((new.raw_user_meta_data ->> 'email_visible')::boolean,false) then new.email else null end)
 on conflict (id) do nothing;
 return new;
end $$;
drop trigger if exists on_plantmatter_user_created on auth.users;
create trigger on_plantmatter_user_created after insert on auth.users for each row execute function public.create_plantmatter_profile();

-- Profile table intentionally does NOT hold private auth email. Public email only appears on opt-in.
-- Future: add observations/photos with strict owner policies, sensitive-coordinate hiding, consent, abuse moderation.
