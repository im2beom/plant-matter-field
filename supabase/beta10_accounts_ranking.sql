-- RAINFOREST MEMORIES / BETA 10 — Run once in Supabase SQL Editor AFTER the BETA 09 SQL.
-- Safe to re-run. Adds:
--   1) Account types: personal (collector / grower / explorer) or space operator
--   2) New space categories (shop · greenhouse · culture · research) + personal spaces (region only)
--   3) Discovery ranking (number of shared, non-private finds per member)
--   4) Member search also returns the account type

-- 1. ACCOUNT TYPE ----------------------------------------------------------------------
alter table public.profiles add column if not exists account_type text not null default 'personal';
alter table public.profiles add column if not exists personal_category text;
do $$ begin
 if not exists (select 1 from pg_constraint where conname = 'profiles_account_type_check') then
  alter table public.profiles add constraint profiles_account_type_check check (account_type in ('personal', 'operator'));
 end if;
 if not exists (select 1 from pg_constraint where conname = 'profiles_personal_category_check') then
  alter table public.profiles add constraint profiles_personal_category_check
   check (personal_category is null or personal_category in ('collector', 'grower', 'explorer'));
 end if;
end $$;
-- Members who already registered a place are treated as space operators.
update public.profiles p set account_type = 'operator'
 where account_type = 'personal' and exists (select 1 from public.botanical_places b where b.owner_id = p.id and b.kind <> 'personal')
   and not exists (select 1 from pg_constraint where conname = 'botanical_places_kind_v10');

-- 2. SPACE CATEGORIES --------------------------------------------------------------------
-- Earlier kinds (workshop / store / studio) stay valid so existing places keep working.
alter table public.botanical_places drop constraint if exists botanical_places_kind_check;
alter table public.botanical_places drop constraint if exists botanical_places_kind_v10;
alter table public.botanical_places add constraint botanical_places_kind_v10
 check (kind in ('shop', 'greenhouse', 'culture', 'research', 'personal', 'workshop', 'store', 'studio'));
-- Personal spaces never store a detailed address.
alter table public.botanical_places drop constraint if exists personal_place_region_only;
alter table public.botanical_places add constraint personal_place_region_only
 check (kind <> 'personal' or address_detail = '');

-- 3. DISCOVERY RANKING ---------------------------------------------------------------------
create or replace function public.discovery_ranking(p_limit integer default 10)
returns table (owner_id uuid, display_name text, avatar_path text, account_type text, personal_category text, finds bigint, species bigint)
language sql stable security definer set search_path = '' as $$
 select o.owner_id, p.display_name, p.avatar_path, p.account_type, p.personal_category,
        count(*) as finds,
        count(distinct lower(btrim(o.scientific_name))) filter (where btrim(o.scientific_name) not in ('', '미동정 식물')) as species
 from public.field_observations o
 join public.profiles p on p.id = o.owner_id
 join auth.users u on u.id = o.owner_id
 where private.is_beta_member()
   and o.is_hidden = false
   and p.onboarding_completed and btrim(p.display_name) <> ''
   and exists (select 1 from public.beta_invites i where lower(i.email) = lower(u.email))
 group by o.owner_id, p.display_name, p.avatar_path, p.account_type, p.personal_category
 order by finds desc, species desc, min(o.observed_at) asc
 limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;
revoke all on function public.discovery_ranking(integer) from public;
grant execute on function public.discovery_ranking(integer) to authenticated;

-- 4. MEMBER SEARCH (now also returns the account type) ---------------------------------------
drop function if exists public.search_members(text);
create function public.search_members(p_query text)
returns table (id uuid, display_name text, avatar_path text, public_email text, public_phone text, account_type text, personal_category text)
language sql stable security definer set search_path = '' as $$
 with q as (
  select btrim(coalesce(p_query, '')) as raw,
         replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') as esc
 )
 select p.id, p.display_name, p.avatar_path, p.public_email, p.public_phone, p.account_type, p.personal_category
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

notify pgrst, 'reload schema';
