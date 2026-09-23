-- Run in Supabase SQL Editor after the registration/profiles migration.
-- Profile information becomes visible to authenticated members; auth.users/email stays private.
begin;

create or replace function public.valid_profile_links(links jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare k text; v jsonb; url text; host text;
begin
  if jsonb_typeof(links) <> 'object' then return false; end if;
  for k, v in select * from jsonb_each(links) loop
    if k not in ('linkedin', 'instagram', 'github', 'telegram', 'website') or jsonb_typeof(v) <> 'string' then return false; end if;
    url := v #>> '{}';
    if length(url) > 500 or url !~ '^https://[a-zA-Z0-9.-]+([/?#][^[:space:]]*)?$' then return false; end if;
    host := case k when 'linkedin' then 'linkedin[.]com' when 'instagram' then 'instagram[.]com' when 'github' then 'github[.]com' when 'telegram' then 't[.]me' else null end;
    if host is not null and url !~ ('^https://(www[.])?' || host || '([/?#]|$)') then return false; end if;
  end loop;
  return true;
end;
$$;
revoke all on function public.valid_profile_links(jsonb) from public, anon;
grant execute on function public.valid_profile_links(jsonb) to authenticated, service_role;

alter table public.profiles
  add column if not exists headline text not null default '' check (char_length(headline) <= 160),
  add column if not exists organization text not null default '' check (char_length(organization) <= 160),
  add column if not exists location text not null default '' check (char_length(location) <= 100),
  add column if not exists bio text not null default '' check (char_length(bio) <= 2000),
  add column if not exists skills text not null default '' check (char_length(skills) <= 400),
  add column if not exists social_links jsonb not null default '{}'::jsonb check (public.valid_profile_links(social_links)),
  add column if not exists avatar_path text not null default '' check (avatar_path = '' or avatar_path ~ ('^' || id::text || '/[0-9a-f-]{36}[.]jpg$'));

grant update (full_name, headline, organization, location, bio, skills, social_links, avatar_path)
on public.profiles to authenticated;
-- Retain owner-only UPDATE and immutable role/id from the registration migration.
drop policy if exists profiles_select_members on public.profiles;
create policy profiles_select_members on public.profiles for select to authenticated using (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_read on storage.objects;
create policy profile_avatars_read on storage.objects for select to authenticated
using (bucket_id = 'profile-avatars');
drop policy if exists profile_avatars_insert on storage.objects;
create policy profile_avatars_insert on storage.objects for insert to authenticated
with check (bucket_id = 'profile-avatars' and name ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}[.]jpg$'));
drop policy if exists profile_avatars_delete on storage.objects;
create policy profile_avatars_delete on storage.objects for delete to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
