-- Apply after registration and profile settings migrations.
begin;
create table if not exists public.business_tasks (
  id bigint generated always as identity (start with 10000) primary key,
  owner_id uuid not null references public.profiles(id),
  title text not null check (char_length(btrim(title)) between 1 and 500),
  description text not null check (char_length(btrim(description)) between 1 and 10000),
  fields jsonb not null default '{}' check (jsonb_typeof(fields) = 'object' and octet_length(fields::text) <= 100000),
  score integer not null default 0 check (score between 0 and 100),
  created_at timestamptz not null default now()
);
create index if not exists business_tasks_owner_idx on public.business_tasks(owner_id);
alter table public.business_tasks enable row level security;
revoke all on public.business_tasks from public, anon, authenticated;
grant select on public.business_tasks to anon, authenticated;
grant insert (owner_id,title,description,fields,score) on public.business_tasks to authenticated;
grant usage on sequence public.business_tasks_id_seq to authenticated;
drop policy if exists business_tasks_read on public.business_tasks;
create policy business_tasks_read on public.business_tasks for select to anon, authenticated using (true);
drop policy if exists business_tasks_publish on public.business_tasks;
create policy business_tasks_publish on public.business_tasks for insert to authenticated
with check (owner_id = (select auth.uid()) and exists(select 1 from public.profiles where id = (select auth.uid()) and role = 'business'));

create table if not exists public.task_proposals (
  id uuid primary key default gen_random_uuid(),
  task_id bigint not null references public.business_tasks(id),
  student_id uuid not null references public.profiles(id),
  team text not null check(char_length(btrim(team)) between 1 and 120),
  idea text not null check(char_length(btrim(idea)) between 1 and 5000),
  plan text not null check(char_length(btrim(plan)) between 1 and 5000),
  deadline text not null check(char_length(btrim(deadline)) between 1 and 120),
  link text not null default '' check(link = '' or (length(link) <= 500 and link ~ '^https://[^[:space:]]+$')),
  status text not null default 'pending' check(status in ('pending','selected','rejected')),
  created_at timestamptz not null default now(),
  unique(task_id, student_id)
);
create index if not exists task_proposals_student_idx on public.task_proposals(student_id);
create unique index if not exists task_proposals_one_selected on public.task_proposals(task_id) where status = 'selected';
alter table public.task_proposals enable row level security;
revoke all on public.task_proposals from public, anon, authenticated;
grant select on public.task_proposals to authenticated;
grant insert (task_id,student_id,team,idea,plan,deadline,link) on public.task_proposals to authenticated;
grant update (status) on public.task_proposals to authenticated;
drop policy if exists task_proposals_read on public.task_proposals;
create policy task_proposals_read on public.task_proposals for select to authenticated
using (student_id = (select auth.uid()) or exists(select 1 from public.business_tasks t where t.id = task_id and t.owner_id = (select auth.uid())));
drop policy if exists task_proposals_send on public.task_proposals;
create policy task_proposals_send on public.task_proposals for insert to authenticated
with check (student_id = (select auth.uid()) and status = 'pending'
  and exists(select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'student')
  and exists(select 1 from public.business_tasks t where t.id = task_id and t.owner_id <> (select auth.uid())));
drop policy if exists task_proposals_decide on public.task_proposals;
create policy task_proposals_decide on public.task_proposals for update to authenticated
using (exists(select 1 from public.business_tasks t where t.id = task_id and t.owner_id = (select auth.uid())))
with check (status in ('selected','rejected') and exists(select 1 from public.business_tasks t where t.id = task_id and t.owner_id = (select auth.uid())));
commit;
