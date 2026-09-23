-- AI Sana: private student proposals for published business tasks.
-- Run ONCE as postgres AFTER registration_profiles.sql, tasks.sql and task_workspaces.sql.
-- Existing tables/data are unchanged. No demo proposals are inserted.

begin;

create table public.proposals (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  task_id bigint not null references public.tasks (id) on delete cascade,
  student_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  team_name text not null check (char_length(btrim(team_name)) between 1 and 200),
  idea text not null check (char_length(btrim(idea)) between 1 and 10000),
  plan text not null check (char_length(btrim(plan)) between 1 and 10000),
  deadline text not null check (char_length(btrim(deadline)) between 1 and 200),
  prototype_url text,
  created_at timestamptz not null default now(),
  constraint proposals_task_student_unique unique (task_id, student_id),
  constraint proposals_prototype_url_safe check (
    prototype_url is null or (
      char_length(prototype_url) between 1 and 2048
      -- Nonempty HTTP(S) authority, no embedded credentials or browser URL backslashes.
      -- API additionally parses and normalizes with the standard URL parser.
      and prototype_url ~* '^https?://[^/@[:space:]?#\\]+([/?#][^[:space:]\\]*)?$'
      and prototype_url !~ '[[:cntrl:]]'
    )
  )
);

create index proposals_student_created_idx
  on public.proposals (student_id, created_at desc, id);
create index proposals_task_created_idx
  on public.proposals (task_id, created_at desc, id);

alter table public.proposals enable row level security;

-- A publishable key plus a verified student session is sufficient; no service key.
-- Never grant client INSERT for identity/ownership/timestamp columns.
revoke all on table public.proposals from public, anon, authenticated, service_role;
grant usage on schema public to authenticated;
grant select on table public.proposals to authenticated;
grant insert (task_id, team_name, idea, plan, deadline, prototype_url)
  on public.proposals to authenticated;

create policy proposals_select_student_own on public.proposals
for select to authenticated
using (
  student_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'student'
  )
);

create policy proposals_select_business_task_owner on public.proposals
for select to authenticated
using (
  exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'business'
  )
  and exists (
    select 1 from public.tasks as task
    where task.id = proposals.task_id and task.owner_id = (select auth.uid())
  )
);

create policy proposals_insert_student_published_task on public.proposals
for insert to authenticated
with check (
  student_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'student'
  )
  -- Students cannot read the owner-private tasks base table. The existing safe
  -- public view proves publication without exposing the business's draft data.
  and exists (
    select 1 from public.published_tasks as task where task.id = proposals.task_id
  )
);

create function public.normalize_proposal_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Match JavaScript String.trim(), including NBSP/BOM and Unicode separators.
  -- Plain SQL btrim() removes only ASCII spaces; accepting tab-only fields here
  -- would make a direct REST insert fail the API's nonempty DTO validation.
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  -- Proposals are append-only in this version, including for the task owner.
  -- No client UPDATE/DELETE grants or policies exist.
  if tg_op = 'UPDATE' then
    raise exception 'Submitted proposals cannot be edited' using errcode = '23514';
  end if;

  new.team_name := pg_catalog.btrim(new.team_name, trim_characters);
  new.idea := pg_catalog.btrim(new.idea, trim_characters);
  new.plan := pg_catalog.btrim(new.plan, trim_characters);
  new.deadline := pg_catalog.btrim(new.deadline, trim_characters);
  new.prototype_url := nullif(pg_catalog.btrim(new.prototype_url, trim_characters), '');
  new.created_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.normalize_proposal_write()
from public, anon, authenticated, service_role;

create trigger proposals_before_write
before insert or update on public.proposals
for each row execute function public.normalize_proposal_write();

comment on table public.proposals is
  'Private immutable student proposals, visible only to their student author and the owner of the associated business task. One submission per student per task.';
comment on column public.proposals.student_id is
  'Verified session owner, populated by auth.uid(); client INSERT cannot override this column.';
comment on column public.proposals.prototype_url is
  'Optional HTTP(S) prototype link without URL credentials. Not fetched by the server.';

notify pgrst, 'reload schema';

commit;
