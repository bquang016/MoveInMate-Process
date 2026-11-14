-- =============================================================================
-- MoveInMate AI — Seed Data (4 Thành viên thật & 28 Daily Tasks từ Ngày 1–7)
-- =============================================================================

insert into public.workspaces (id, slug, name, description)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'moveinmate-vhr16',
    'MoveInMate AI · VHR-16 MVP Delivery',
    'Kế hoạch triển khai song song 7 ngày theo 4 vertical slices: Onboarding, RAG Knowledge, Service Request & DevOps, BQL Copilot & UX.'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'other-team-isolated',
    'Isolated Tenant Workspace B (RLS Verification)',
    'Workspace cách ly dùng để kiểm thử cross-workspace Row Level Security.'
  )
on conflict (slug) do update
  set name = excluded.name,
      description = excluded.description;

insert into public.team_members (workspace_id, member_code, display_name, email, slice_name, cross_role, color_hex, avatar_label, is_lead)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'TV1',
    'TV1 · Bùi Đăng Quang',
    'buidangquangmtp@gmail.com',
    'Onboarding & Resident Checklist',
    'Integration Lead (Tiến độ, scope, tích hợp)',
    '#3157d5',
    '1',
    true
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'TV2',
    'TV2 · Đinh Trần Nguyên',
    'nguyentrandinh.tn@gmail.com',
    'RAG, Chunking, Citation & AI Eval',
    'Data & AI Quality Lead (Schema, golden set, eval)',
    '#7c3aed',
    '2',
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'TV3',
    'TV3 · Trần Trọng Đức Tài',
    'trongductai2005@gmail.com',
    'Service Request, Routing & Security',
    'Security & DevOps Lead (DB, RLS, Docker, Deploy)',
    '#07845b',
    '3',
    false
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'TV4',
    'TV4 · Nguyễn Tuấn Anh',
    'capntryisreal@gmail.com',
    'BQL Copilot, HITL Approval & UX',
    'UX & Documentation Lead (UI kit, report, demo)',
    '#c24b14',
    '4',
    false
  )
on conflict (workspace_id, member_code) do update
  set display_name = excluded.display_name,
      email = excluded.email,
      slice_name = excluded.slice_name,
      cross_role = excluded.cross_role,
      color_hex = excluded.color_hex,
      avatar_label = excluded.avatar_label,
      is_lead = excluded.is_lead;

-- Cho phép đồng bộ trực tiếp từ ứng dụng web cho workspace chính
drop policy if exists "allow_workspace_vhr16_read_workspaces" on public.workspaces;
create policy "allow_workspace_vhr16_read_workspaces"
  on public.workspaces
  for select
  to anon, authenticated
  using (id = '11111111-1111-4111-8111-111111111111');

drop policy if exists "allow_workspace_vhr16_sync_members" on public.team_members;
create policy "allow_workspace_vhr16_sync_members"
  on public.team_members
  for all
  to anon, authenticated
  using (workspace_id = '11111111-1111-4111-8111-111111111111')
  with check (workspace_id = '11111111-1111-4111-8111-111111111111');

drop policy if exists "allow_workspace_vhr16_sync_tasks" on public.tasks;
create policy "allow_workspace_vhr16_sync_tasks"
  on public.tasks
  for all
  to anon, authenticated
  using (workspace_id = '11111111-1111-4111-8111-111111111111')
  with check (workspace_id = '11111111-1111-4111-8111-111111111111');

drop policy if exists "allow_workspace_vhr16_sync_criteria" on public.task_criteria;
create policy "allow_workspace_vhr16_sync_criteria"
  on public.task_criteria
  for all
  to anon, authenticated
  using (workspace_id = '11111111-1111-4111-8111-111111111111')
  with check (workspace_id = '11111111-1111-4111-8111-111111111111');

drop policy if exists "allow_workspace_vhr16_sync_handovers" on public.handovers;
create policy "allow_workspace_vhr16_sync_handovers"
  on public.handovers
  for all
  to anon, authenticated
  using (workspace_id = '11111111-1111-4111-8111-111111111111')
  with check (workspace_id = '11111111-1111-4111-8111-111111111111');

drop policy if exists "allow_workspace_vhr16_sync_audit" on public.audit_logs;
create policy "allow_workspace_vhr16_sync_audit"
  on public.audit_logs
  for all
  to anon, authenticated
  using (workspace_id = '11111111-1111-4111-8111-111111111111')
  with check (workspace_id = '11111111-1111-4111-8111-111111111111');

-- Xoá toàn bộ dữ liệu mock cũ (nếu có)
delete from public.tasks
 where id in (
   'T-TV1-01','T-TV1-02','T-TV2-01','T-TV2-02',
   'T-TV3-01','T-TV3-02','T-TV4-01','T-TV4-02','T-ALL-09'
 );
