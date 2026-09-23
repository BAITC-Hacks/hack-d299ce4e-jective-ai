-- AI Sana: persisted business decisions on student proposals.
-- Run ONCE as postgres AFTER 20260923000400_proposals.sql.
-- Existing proposals remain intact and start with status = 'pending'.

begin;

alter table public.proposals
  add column status text not null default 'pending',
  add column decided_at timestamptz,
  add constraint proposals_status_valid check (
    status in ('pending', 'accepted', 'rejected')
  ),
  add constraint proposals_decision_time_valid check (
    (status = 'pending' and decided_at is null)
    or (status in ('accepted', 'rejected') and decided_at is not null)
  );

-- Existing INSERT column grants intentionally exclude status and decided_at.
-- Neither the student nor the business can edit submitted content or timestamps.
grant update (status) on public.proposals to authenticated;

create policy proposals_update_business_task_owner on public.proposals
for update to authenticated
using (
  exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'business'
  )
  and exists (
    select 1 from public.tasks as task
    where task.id = proposals.task_id and task.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.profiles as profile
    where profile.id = (select auth.uid()) and profile.role = 'business'
  )
  and exists (
    select 1 from public.tasks as task
    where task.id = proposals.task_id and task.owner_id = (select auth.uid())
  )
);

-- Reuse the trigger from migration 004. Preserve its original input normalization
-- while allowing only business decisions, not editing of submitted proposals.
create or replace function public.normalize_proposal_write()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  -- Same complete whitespace set as JavaScript String.trim().
  trim_characters constant text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if tg_op = 'UPDATE' then
    if row(
      new.id, new.task_id, new.student_id, new.team_name, new.idea, new.plan,
      new.deadline, new.prototype_url, new.created_at
    ) is distinct from row(
      old.id, old.task_id, old.student_id, old.team_name, old.idea, old.plan,
      old.deadline, old.prototype_url, old.created_at
    ) then
      raise exception 'Submitted proposal content and identity cannot be changed'
        using errcode = '23514';
    end if;

    if new.decided_at is distinct from old.decided_at then
      raise exception 'Proposal decision time is assigned by the server'
        using errcode = '23514';
    end if;

    if new.status is null or new.status not in ('accepted', 'rejected') then
      raise exception 'A business decision must be accepted or rejected'
        using errcode = '23514';
    end if;

    new.decided_at := case
      when new.status is distinct from old.status then pg_catalog.now()
      else old.decided_at
    end;
    return new;
  end if;

  new.team_name := pg_catalog.btrim(new.team_name, trim_characters);
  new.idea := pg_catalog.btrim(new.idea, trim_characters);
  new.plan := pg_catalog.btrim(new.plan, trim_characters);
  new.deadline := pg_catalog.btrim(new.deadline, trim_characters);
  new.prototype_url := nullif(pg_catalog.btrim(new.prototype_url, trim_characters), '');
  new.created_at := pg_catalog.now();
  new.status := 'pending';
  new.decided_at := null;
  return new;
end;
$$;

revoke all on function public.normalize_proposal_write()
from public, anon, authenticated, service_role;

comment on table public.proposals is
  'Private student proposals with immutable submitted content, visible only to their student author and the task owner. Only the business owner may accept/reject a proposal.';
comment on column public.proposals.status is
  'pending on submission; accepted/rejected only by the verified business task owner. Decisions are independent per proposal and do not close the task.';
comment on column public.proposals.decided_at is
  'Server time of the most recent status change, null before a decision. Repeating the same decision preserves this timestamp.';

notify pgrst, 'reload schema';

commit;
