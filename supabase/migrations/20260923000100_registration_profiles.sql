-- AI Sana: initial email/password registration schema for a NEW Supabase project.
-- Run once in Supabase SQL Editor as the postgres database owner.
-- Supabase already manages auth.users; do not create it or store passwords here.
-- signUp must send options.data = { full_name: '...', role: 'business' | 'student' }.
-- Dashboard/OAuth users also require these metadata until an onboarding flow is added.

begin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null
    check (char_length(btrim(full_name)) between 1 and 120),
  role text not null check (role in ('business', 'student')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Remove default API grants before allowing access only to the necessary columns.
revoke all on table public.profiles from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.profiles to service_role;

create policy profiles_select_own
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- No client INSERT/DELETE policy: the Auth trigger creates the profile.
-- Role is selected only on signup, never updated through the browser API.
create function public.create_registration_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    new.raw_user_meta_data ->> 'role'
  );
  return new;
end;
$$;

revoke all on function public.create_registration_profile()
from public, anon, authenticated;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.create_registration_profile();

create function public.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.full_name := pg_catalog.btrim(new.full_name);
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.touch_profile_updated_at()
from public, anon, authenticated;

create trigger profiles_before_update
before update on public.profiles
for each row execute function public.touch_profile_updated_at();

commit;
