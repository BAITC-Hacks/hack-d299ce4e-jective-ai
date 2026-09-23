-- Run in Supabase SQL Editor AFTER registration_profiles.sql.
-- Private business attachments only. Existing tasks/profiles/auth tables are unchanged.
begin;

create table if not exists public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  draft_id uuid not null,
  name text not null check (char_length(name) between 1 and 200 and position('/' in name) = 0 and position(chr(92) in name) = 0 and name !~ '[[:cntrl:]]'),
  mime_type text not null check (mime_type in ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv','image/png','image/jpeg','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  storage_path text not null unique,
  extracted_context jsonb check (extracted_context is null or (jsonb_typeof(extracted_context) = 'object' and octet_length(extracted_context::text) <= 65536)),
  created_at timestamptz not null default now(),
  check (storage_path like owner_id::text || '/' || draft_id::text || '/' || id::text || '.%'
    and storage_path ~ '^[0-9a-f-]+/[0-9a-f-]+/[0-9a-f-]+\.(pdf|docx|xlsx|txt|csv|png|jpg|jpeg|webp)$')
);
create index if not exists task_attachments_owner_draft on public.task_attachments(owner_id,draft_id);
alter table public.task_attachments enable row level security;
revoke all on public.task_attachments from public, anon, authenticated;
grant select, insert, delete on public.task_attachments to authenticated;
grant update(extracted_context) on public.task_attachments to authenticated;

drop policy if exists task_attachments_own_business on public.task_attachments;
create policy task_attachments_own_business on public.task_attachments for all to authenticated
using (owner_id = (select auth.uid()) and exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'business'))
with check (owner_id = (select auth.uid()) and exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'business'));

create or replace function public.limit_task_attachments() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.owner_id::text || '/' || new.draft_id::text, 0));
  if (select count(*) from public.task_attachments where owner_id = new.owner_id and draft_id = new.draft_id) >= 5 then
    raise exception 'A draft can have at most five attachments' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.limit_task_attachments() from public, anon, authenticated;
drop trigger if exists task_attachments_limit on public.task_attachments;
create trigger task_attachments_limit before insert on public.task_attachments for each row execute function public.limit_task_attachments();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('task-attachments','task-attachments',false,10485760,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv','image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists task_attachments_storage_select on storage.objects;
create policy task_attachments_storage_select on storage.objects for select to authenticated
using (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'business'));

drop policy if exists task_attachments_storage_insert on storage.objects;
create policy task_attachments_storage_insert on storage.objects for insert to authenticated
with check (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists(select 1 from public.task_attachments a where a.storage_path = storage.objects.name and a.owner_id = (select auth.uid())));

drop policy if exists task_attachments_storage_delete on storage.objects;
create policy task_attachments_storage_delete on storage.objects for delete to authenticated
using (bucket_id = 'task-attachments' and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'business'));
-- No UPDATE policy: original files are immutable; remove and upload a new version.
commit;
