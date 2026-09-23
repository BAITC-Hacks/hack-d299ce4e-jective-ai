-- AI Sana: real drafts and published catalog tasks.
-- Run ONCE as postgres in Supabase SQL Editor AFTER registration_profiles.sql.
-- Existing tables are deliberately not dropped/replaced. No demo rows are inserted.

begin;

create table public.tasks (
  id bigint generated always as identity (maxvalue 9007199254740991) primary key,
  owner_id uuid not null default auth.uid()
    references public.profiles (id) on delete cascade,
  request_id uuid not null default pg_catalog.gen_random_uuid(),
  status text not null default 'draft' check (status in ('draft', 'published')),
  original_description text not null default ''
    check (char_length(original_description) <= 10000),
  analysis_snapshot jsonb,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  context text check (char_length(context) <= 10000),
  need text check (char_length(need) <= 10000),
  users text check (char_length(users) <= 10000),
  data text check (char_length(data) <= 10000),
  constraints text check (char_length(constraints) <= 10000),
  expected_result text check (char_length(expected_result) <= 10000),
  success_criteria text check (char_length(success_criteria) <= 10000),
  business_contact text check (char_length(business_contact) <= 10000),
  interaction_format text check (char_length(interaction_format) <= 10000),
  industry text not null default '' check (char_length(industry) <= 100),
  direction text not null default '' check (char_length(direction) <= 100),
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 10),
  score integer check (score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint tasks_positive_safe_id check (id between 1 and 9007199254740991),
  constraint tasks_owner_request_unique unique (owner_id, request_id),
  constraint tasks_analysis_snapshot_object check (
    analysis_snapshot is null or (
      jsonb_typeof(analysis_snapshot) = 'object'
      and analysis_snapshot ? 'version'
      and analysis_snapshot -> 'version' = '1'::jsonb
    )
  ),
  constraint tasks_analysis_snapshot_size check (
    analysis_snapshot is null or octet_length(analysis_snapshot::text) <= 262144
  ),
  constraint tasks_published_content check (
    status <> 'published' or (
      char_length(btrim(original_description)) >= 20
      and need is not null and char_length(btrim(need)) > 0
      and expected_result is not null and char_length(btrim(expected_result)) > 0
    )
  ),
  constraint tasks_publication_time check (
    (status = 'draft' and published_at is null)
    or (status = 'published' and published_at is not null)
  )
);

create index tasks_owner_created_idx on public.tasks (owner_id, created_at desc, id desc);
create index tasks_published_idx on public.tasks (published_at desc, id desc)
  where status = 'published';

alter table public.tasks enable row level security;

-- Explicitly remove inherited/default API privileges. No API DELETE is exposed.
revoke all on table public.tasks from public, anon, authenticated, service_role;
revoke all on sequence public.tasks_id_seq from public, anon, authenticated, service_role;
grant usage on schema public to anon, authenticated;
grant usage on sequence public.tasks_id_seq to authenticated;
grant select on table public.tasks to authenticated;
grant insert (
  request_id, status, original_description, analysis_snapshot, title, context, need, users, data,
  constraints, expected_result, success_criteria, business_contact,
  interaction_format, industry, direction, tags, score
) on public.tasks to authenticated;
grant update (
  status, original_description, analysis_snapshot, title, context, need, users, data,
  constraints, expected_result, success_criteria, business_contact,
  interaction_format, industry, direction, tags, score
) on public.tasks to authenticated;

create policy tasks_select_own on public.tasks
for select to authenticated
using (owner_id = (select auth.uid()));

-- Business role comes from the protected profile, never JWT user_metadata.
create policy tasks_insert_business_own on public.tasks
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'business'
  )
);

create policy tasks_update_business_own on public.tasks
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

create function public.normalize_task_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tag text;
  normalized_tags text[] := '{}'::text[];
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.owner_id is distinct from old.owner_id
      or new.request_id is distinct from old.request_id
      or new.created_at is distinct from old.created_at then
      raise exception 'Task identity and ownership cannot be changed' using errcode = '23514';
    end if;
    -- A stale draft save cannot unpublish OR overwrite a newer published card.
    if old.status = 'published' and new.status = 'draft' then
      return old;
    end if;
    new.published_at := case
      when old.status = 'published' then old.published_at
      when new.status = 'published' then pg_catalog.now()
      else null
    end;
  else
    new.created_at := pg_catalog.now();
    new.published_at := case
      when new.status = 'published' then pg_catalog.now()
      else null
    end;
  end if;

  new.updated_at := pg_catalog.now();
  new.original_description := pg_catalog.btrim(new.original_description);
  new.title := pg_catalog.btrim(new.title);
  new.context := nullif(pg_catalog.btrim(new.context), '');
  new.need := nullif(pg_catalog.btrim(new.need), '');
  new.users := nullif(pg_catalog.btrim(new.users), '');
  new.data := nullif(pg_catalog.btrim(new.data), '');
  new.constraints := nullif(pg_catalog.btrim(new.constraints), '');
  new.expected_result := nullif(pg_catalog.btrim(new.expected_result), '');
  new.success_criteria := nullif(pg_catalog.btrim(new.success_criteria), '');
  new.business_contact := nullif(pg_catalog.btrim(new.business_contact), '');
  new.interaction_format := nullif(pg_catalog.btrim(new.interaction_format), '');
  new.industry := pg_catalog.btrim(new.industry);
  new.direction := pg_catalog.btrim(new.direction);

  if new.tags is not null then
    foreach tag in array new.tags loop
      tag := pg_catalog.btrim(tag);
      if tag is null or pg_catalog.char_length(tag) not between 1 and 50 then
        raise exception 'Each task tag must contain 1 to 50 characters' using errcode = '23514';
      end if;
      normalized_tags := pg_catalog.array_append(normalized_tags, tag);
    end loop;
    new.tags := normalized_tags;
  end if;

  return new;
end;
$$;

revoke all on function public.normalize_task_write() from public, anon, authenticated, service_role;

create trigger tasks_before_write
before insert or update on public.tasks
for each row execute function public.normalize_task_write();

-- INTENTIONAL owner-rights view: anon may read only this explicit public projection.
-- Invoker security would require anon access to the private base table, which is forbidden.
-- The barrier keeps caller predicates behind the publication filter. Never use SELECT * here.
create view public.published_tasks
with (security_barrier = true, security_invoker = false)
as
select
  id,
  status,
  title,
  coalesce(need, context, title) as description,
  context,
  need,
  users,
  data,
  constraints,
  expected_result,
  success_criteria,
  interaction_format,
  industry,
  direction,
  tags,
  score,
  created_at,
  updated_at,
  published_at
from public.tasks
where status = 'published';

alter view public.published_tasks owner to postgres;
revoke all on table public.published_tasks from public, anon, authenticated, service_role;
grant select on table public.published_tasks to anon, authenticated;

comment on table public.tasks is
  'Owner-private task drafts and publication source. API writes require a verified business profile.';
comment on column public.tasks.original_description is
  'Private original user input; intentionally excluded from published_tasks.';
comment on column public.tasks.analysis_snapshot is
  'Private per-task archive of the last saved questionnaire and answers, copied from the verified owner workspace by the API. Never exposed in published_tasks.';
comment on column public.tasks.business_contact is
  'Private business contact; intentionally excluded from published_tasks.';
comment on column public.tasks.score is
  'Informational quality score, not an authorization or trust signal.';
comment on view public.published_tasks is
  'Intentional postgres-owned security-barrier read-only public projection of published tasks. No private input, contact or owner identifiers.';

notify pgrst, 'reload schema';

commit;
