-- PLANT MATTER RAINFOREST MEMORIES / BETA 05
-- Run AFTER schema_online_beta04.sql, as the project owner in Supabase SQL Editor.
-- Repairs authenticated role table grants and beta invite helper, and adds onboarding.
-- Do not paste any service_role keys into the app or GitHub.

create table if not exists public.beta_invites (
  email text primary key,
  invited_at timestamptz not null default now()
);
alter table public.beta_invites enable row level security;
revoke all on public.beta_invites from anon, authenticated;

create schema if not exists private;
create or replace function private.is_beta_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.beta_invites i
    where lower(i.email)=lower(auth.jwt()->>'email')
  );
$$;
revoke all on function private.is_beta_member() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_beta_member() to authenticated;
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
 updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists public_phone text;
alter table public.profiles add column if not exists onboarding_completed boolean not null default false;
alter table public.profiles enable row level security;
-- Preserve existing profile read policy; add owner access if the previous SQL was partially applied.
drop policy if exists "Beta members view profiles" on public.profiles;
create policy "Beta members view profiles" on public.profiles
 for select to authenticated using (public.is_beta_member() or id=(select auth.uid()));
drop policy if exists "Owners can update profiles" on public.profiles;
create policy "Owners can update profiles" on public.profiles
 for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
drop policy if exists "Owners can insert profiles" on public.profiles;
create policy "Owners can insert profiles" on public.profiles
 for insert to authenticated with check (id=(select auth.uid()));
-- Avoid any accidental previous public read policy.
drop policy if exists "Anyone can view public profiles" on public.profiles;
grant usage on schema public to authenticated;
grant select,insert,update on public.profiles to authenticated;
revoke all on public.profiles from anon;

-- PRIVATE phone and consent history. Other users cannot query this table.
create table if not exists public.profile_private_settings (
 id uuid primary key references auth.users(id) on delete cascade,
 phone text,
 phone_visible boolean not null default false,
 accepted_terms_at timestamptz,
 accepted_privacy_at timestamptz,
 consent_version text,
 photo_promotion_consent boolean not null default false,
 promotion_consent_updated_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint phone_length check (phone is null or length(phone) <=25)
);
alter table public.profile_private_settings enable row level security;
drop policy if exists "Owner select private settings" on public.profile_private_settings;
drop policy if exists "Owner insert private settings" on public.profile_private_settings;
drop policy if exists "Owner update private settings" on public.profile_private_settings;
create policy "Owner select private settings" on public.profile_private_settings
 for select to authenticated using (id=(select auth.uid()));
create policy "Owner insert private settings" on public.profile_private_settings
 for insert to authenticated with check (id=(select auth.uid()));
create policy "Owner update private settings" on public.profile_private_settings
 for update to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
grant select,insert,update on public.profile_private_settings to authenticated;
revoke all on public.profile_private_settings from anon;

-- Atomically save publicly visible fields and private fields with an invoker-only function.
create or replace function public.save_member_profile(
 p_display_name text, p_phone text, p_email_visible boolean, p_phone_visible boolean,
 p_accept_terms boolean, p_accept_privacy boolean, p_photo_promotion_consent boolean
) returns void language plpgsql security invoker set search_path='' as $$
declare v_uid uuid := (select auth.uid()); v_email text := (select auth.jwt()->>'email');
begin
 if v_uid is null then raise exception '로그인이 필요합니다'; end if;
 if char_length(trim(coalesce(p_display_name,'')))<1 or char_length(p_display_name)>50 then
   raise exception '표시 이름은 1~50자로 입력해 주세요'; end if;
 if not coalesce(p_accept_terms,false) or not coalesce(p_accept_privacy,false) then
   raise exception '필수 이용약관 동의가 필요합니다'; end if;
 if p_phone is not null and (length(p_phone)>25 or p_phone !~ '^[+0-9() .-]+$') then
   raise exception '전화번호 형식을 확인해 주세요'; end if;
 insert into public.profiles(id,display_name,email_visible,public_email,public_phone,onboarding_completed,updated_at)
 values(v_uid,trim(p_display_name),coalesce(p_email_visible,false),
   case when p_email_visible then v_email else null end,
   case when p_phone_visible and trim(coalesce(p_phone,''))<>'' then trim(p_phone) else null end,
   true,now())
 on conflict(id) do update set display_name=excluded.display_name,email_visible=excluded.email_visible,
   public_email=excluded.public_email,public_phone=excluded.public_phone,
   onboarding_completed=true,updated_at=now();
 insert into public.profile_private_settings(id,phone,phone_visible,accepted_terms_at,accepted_privacy_at,
   consent_version,photo_promotion_consent,promotion_consent_updated_at,updated_at)
 values(v_uid,nullif(trim(coalesce(p_phone,'')),''),coalesce(p_phone_visible,false),now(),now(),
   'beta05-2026-11',coalesce(p_photo_promotion_consent,false),now(),now())
 on conflict(id) do update set phone=excluded.phone,phone_visible=excluded.phone_visible,
   accepted_terms_at=coalesce(public.profile_private_settings.accepted_terms_at,now()),
   accepted_privacy_at=coalesce(public.profile_private_settings.accepted_privacy_at,now()),
   consent_version=excluded.consent_version,
   photo_promotion_consent=excluded.photo_promotion_consent,
   promotion_consent_updated_at=case when public.profile_private_settings.photo_promotion_consent
     is distinct from excluded.photo_promotion_consent then now()
     else public.profile_private_settings.promotion_consent_updated_at end,
   updated_at=now();
end $$;
revoke all on function public.save_member_profile(text,text,boolean,boolean,boolean,boolean,boolean) from public;
grant execute on function public.save_member_profile(text,text,boolean,boolean,boolean,boolean,boolean) to authenticated;

-- Profile row for existing users if the sign-up trigger was installed late.
insert into public.profiles(id,display_name,email_visible,public_email)
select id,left(coalesce(raw_user_meta_data->>'display_name',split_part(email,'@',1),'Member'),50),false,null
from auth.users on conflict(id) do nothing;

-- In case the beta04 main schema was applied with automatic table grants disabled:
do $$ begin
 if to_regclass('public.field_observations') is not null then
  grant select,insert,update,delete on public.field_observations to authenticated;
 end if;
 if to_regclass('public.field_identifications') is not null then
  grant select,insert on public.field_identifications to authenticated;
 end if;
 if to_regclass('public.field_private_locations') is not null then
  grant select,insert,update,delete on public.field_private_locations to authenticated;
 end if;
end $$;

notify pgrst, 'reload schema';
