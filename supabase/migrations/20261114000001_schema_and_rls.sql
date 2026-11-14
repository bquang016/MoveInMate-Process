-- =============================================================================
-- MoveInMate AI — Team Progress & Handover Tracker (VHR-16)
-- Migration: 20261114000001_schema_and_rls.sql
-- Features:
--   1. Multi-workspace tenant isolation (workspaces, team_members/profiles)
--   2. Collaborative task tracking (tasks, task_criteria, task_dependencies)
--   3. Inter-member handovers & immutable audit logs (handovers, audit_logs)
--   4. Database-level workflow gate trigger (Done requires mandatory criteria + reviewer approval)
--   5. Row Level Security (RLS) policies for authenticated workspace members & owner/reviewer rules
--   6. Supabase Realtime publication for live multi-browser collaboration
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. WORKSPACES
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. TEAM MEMBERS / PROFILES
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  member_code text not null check (member_code in ('TV1', 'TV2', 'TV3', 'TV4')),
  display_name text not null,
  email text not null,
  slice_name text not null,
  cross_role text not null,
  color_hex text not null default '#3157d5',
  avatar_label text not null default '1',
  is_lead boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, member_code),
  unique (workspace_id, email)
);

-- 3. TASKS
create table if not exists public.tasks (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  day_number int not null check (day_number between 1 and 7),
  day_phase text not null,
  module_slice text not null check (module_slice in ('Onboarding', 'RAG', 'Service & DevOps', 'BQL Copilot & UX')),
  title text not null,
  description text not null,
  deliverable_summary text not null default '',
  owner_code text not null check (owner_code in ('TV1', 'TV2', 'TV3', 'TV4')),
  reviewer_code text not null check (reviewer_code in ('TV1', 'TV2', 'TV3', 'TV4')),
  supporter_codes text[] not null default '{}',
  handover_to_codes text[] not null default '{}',
  handover_condition text not null default '',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'done')),
  priority text not null default 'P0' check (priority in ('P0', 'P1', 'P2')),
  deadline timestamptz not null,
  blocker text not null default '',
  is_blocked boolean not null default false,
  reviewer_approved boolean not null default false,
  reviewer_approved_by text,
  reviewer_approved_at timestamptz,
  reviewer_note text not null default '',
  ai_suggestion text not null default '',
  ai_confidence text not null default 'high' check (ai_confidence in ('high', 'medium', 'low')),
  evidence_links text[] not null default '{}',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4. TASK CRITERIA (Checklist tiêu chí đầu ra)
create table if not exists public.task_criteria (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  label text not null,
  category text not null default 'functional' check (category in ('functional', 'ai_quality', 'security', 'handover', 'testing')),
  is_mandatory boolean not null default true,
  is_completed boolean not null default false,
  completed_by text,
  completed_at timestamptz,
  sort_order int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. TASK DEPENDENCIES
create table if not exists public.task_dependencies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  depends_on_task_id text not null references public.tasks(id) on delete cascade,
  dependency_type text not null default 'contract' check (dependency_type in ('contract', 'schema', 'api', 'review', 'release')),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (task_id, depends_on_task_id)
);

-- 6. HANDOVERS (Điểm giao nhau giữa các thành viên)
create table if not exists public.handovers (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id text not null references public.tasks(id) on delete cascade,
  from_member_code text not null check (from_member_code in ('TV1', 'TV2', 'TV3', 'TV4')),
  to_member_code text not null check (to_member_code in ('TV1', 'TV2', 'TV3', 'TV4')),
  reviewer_code text not null check (reviewer_code in ('TV1', 'TV2', 'TV3', 'TV4')),
  stage_name text not null,
  input_required text not null default '',
  condition_text text not null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'accepted', 'changes_requested')),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

-- 7. AUDIT LOGS / TASK HISTORY
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id text references public.tasks(id) on delete set null,
  actor_code text not null,
  actor_name text not null,
  action_type text not null check (
    action_type in (
      'status_changed',
      'criteria_toggled',
      'reviewer_decision',
      'blocker_updated',
      'task_updated',
      'handover_updated',
      'comment_added'
    )
  ),
  summary text not null,
  previous_state jsonb not null default '{}'::jsonb,
  next_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- TRIGGERS: updated_at + workflow quality gate + automatic audit trail
-- =============================================================================

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_workspaces_updated_at on public.workspaces;
create trigger trg_workspaces_updated_at
before update on public.workspaces
for each row execute function public.touch_updated_at();

drop trigger if exists trg_team_members_updated_at on public.team_members;
create trigger trg_team_members_updated_at
before update on public.team_members
for each row execute function public.touch_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
before update on public.tasks
for each row execute function public.touch_updated_at();

drop trigger if exists trg_task_criteria_updated_at on public.task_criteria;
create trigger trg_task_criteria_updated_at
before update on public.task_criteria
for each row execute function public.touch_updated_at();

-- Quality Gate Trigger: Prevent marking a task 'done' without mandatory criteria & reviewer approval
create or replace function public.enforce_task_workflow_gate()
returns trigger
language plpgsql
as $$
declare
  incomplete_mandatory_count int;
begin
  if new.status = 'done' then
    if coalesce(new.reviewer_approved, false) = false then
      raise exception 'WORKFLOW_GATE_VIOLATION: Task % cannot be marked Done before Reviewer (%) approves.', new.id, new.reviewer_code;
    end if;

    select count(*)
      into incomplete_mandatory_count
      from public.task_criteria tc
     where tc.task_id = new.id
       and tc.is_mandatory = true
       and tc.is_completed = false;

    if incomplete_mandatory_count > 0 then
      raise exception 'WORKFLOW_GATE_VIOLATION: Task % still has % incomplete mandatory criteria.', new.id, incomplete_mandatory_count;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_task_workflow_gate on public.tasks;
create trigger trg_enforce_task_workflow_gate
before insert or update on public.tasks
for each row execute function public.enforce_task_workflow_gate();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) HELPERS & POLICIES
-- =============================================================================

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.team_members tm
     where tm.workspace_id = target_workspace_id
       and (
         tm.user_id = auth.uid()
         or lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       )
  );
$$;

create or replace function public.current_member_code(target_workspace_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tm.member_code
    from public.team_members tm
   where tm.workspace_id = target_workspace_id
     and (
       tm.user_id = auth.uid()
       or lower(tm.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
     )
   limit 1;
$$;

alter table public.workspaces enable row level security;
alter table public.team_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_criteria enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.handovers enable row level security;
alter table public.audit_logs enable row level security;

-- Workspaces: only members of the workspace can read it
drop policy if exists "workspace_members_select_workspaces" on public.workspaces;
create policy "workspace_members_select_workspaces"
  on public.workspaces
  for select
  to authenticated
  using (public.is_workspace_member(id));

-- Team members: members can view their workspace roster; a member can update their own profile or TV1 lead can update
drop policy if exists "workspace_members_select_team_members" on public.team_members;
create policy "workspace_members_select_team_members"
  on public.team_members
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_update_own_or_lead_profile" on public.team_members;
create policy "workspace_members_update_own_or_lead_profile"
  on public.team_members
  for update
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      user_id = auth.uid()
      or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      or public.current_member_code(workspace_id) = 'TV1'
    )
  )
  with check (public.is_workspace_member(workspace_id));

-- Tasks: all authenticated members of the workspace can view tasks;
-- Updates allowed for workspace members (owner, reviewer, supporter, or Integration Lead TV1)
drop policy if exists "workspace_members_select_tasks" on public.tasks;
create policy "workspace_members_select_tasks"
  on public.tasks
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_owner_reviewer_update_tasks" on public.tasks;
create policy "workspace_owner_reviewer_update_tasks"
  on public.tasks
  for update
  to authenticated
  using (
    public.is_workspace_member(workspace_id)
    and (
      public.current_member_code(workspace_id) in (owner_code, reviewer_code, 'TV1')
      or public.current_member_code(workspace_id) = any(supporter_codes)
    )
  )
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert_tasks" on public.tasks;
create policy "workspace_members_insert_tasks"
  on public.tasks
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

-- Task Criteria: readable and updatable by workspace members
drop policy if exists "workspace_members_select_criteria" on public.task_criteria;
create policy "workspace_members_select_criteria"
  on public.task_criteria
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_update_criteria" on public.task_criteria;
create policy "workspace_members_update_criteria"
  on public.task_criteria
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert_criteria" on public.task_criteria;
create policy "workspace_members_insert_criteria"
  on public.task_criteria
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

-- Task Dependencies
drop policy if exists "workspace_members_select_dependencies" on public.task_dependencies;
create policy "workspace_members_select_dependencies"
  on public.task_dependencies
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

-- Handovers
drop policy if exists "workspace_members_select_handovers" on public.handovers;
create policy "workspace_members_select_handovers"
  on public.handovers
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_update_handovers" on public.handovers;
create policy "workspace_members_update_handovers"
  on public.handovers
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

-- Audit Logs: immutable append-only history within workspace
drop policy if exists "workspace_members_select_audit_logs" on public.audit_logs;
create policy "workspace_members_select_audit_logs"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert_audit_logs" on public.audit_logs;
create policy "workspace_members_insert_audit_logs"
  on public.audit_logs
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id));

-- =============================================================================
-- SUPABASE REALTIME PUBLICATION
-- =============================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.tasks;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.task_criteria;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.handovers;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.audit_logs;
    exception when duplicate_object then null;
    end;
    begin
      alter publication supabase_realtime add table public.team_members;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;

