-- AI Sana: one private, resumable AI questionnaire workspace per business user.
-- Run ONCE as postgres AFTER registration_profiles.sql and tasks.sql.
-- Snapshot content is private even if a task derived from it is later published.

begin;

create table public.task_workspaces (
  owner_id uuid primary key default auth.uid()
    references public.profiles (id) on delete cascade,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  constraint task_workspaces_snapshot_object check (
    jsonb_typeof(snapshot) = 'object'
    and snapshot ? 'version'
    and snapshot -> 'version' = '1'::jsonb
  ),
  constraint task_workspaces_snapshot_size check (
    octet_length(snapshot::text) <= 262144
  )
);

alter table public.task_workspaces enable row level security;
revoke all on table public.task_workspaces from public, anon, authenticated, service_role;
grant usage on schema public to authenticated;
grant select on table public.task_workspaces to authenticated;
grant insert (snapshot) on public.task_workspaces to authenticated;
grant update (snapshot) on public.task_workspaces to authenticated;

create policy task_workspaces_select_business_own on public.task_workspaces
for select to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'business'
  )
);

create policy task_workspaces_insert_business_own on public.task_workspaces
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'business'
  )
);

create policy task_workspaces_update_business_own on public.task_workspaces
for update to authenticated
using (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'business'
  )
)
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'business'
  )
);

create function public.normalize_task_workspace_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.owner_id is distinct from old.owner_id then
    raise exception 'Workspace ownership cannot be changed' using errcode = '23514';
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.normalize_task_workspace_write()
from public, anon, authenticated, service_role;

create trigger task_workspaces_before_write
before insert or update on public.task_workspaces
for each row execute function public.normalize_task_workspace_write();

comment on table public.task_workspaces is
  'One owner-private active AI questionnaire workspace per business profile; never part of the public catalog.';
comment on column public.task_workspaces.snapshot is
  'Versioned private questionnaire snapshot: original input, generated questions, user answers, result card and analysis metadata. API validates allowed fields. Never store credentials.';

notify pgrst, 'reload schema';

commit;
