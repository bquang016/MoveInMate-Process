import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  DEFAULT_WORKSPACE_ID,
  DEFAULT_WORKSPACE_SLUG,
  SEED_HANDOVERS,
  SEED_TASKS,
  SEED_TEAM_MEMBERS,
} from '../data/seedData';
import type {
  AIConfidence,
  AuditActionType,
  AuditLogItem,
  CriterionCategory,
  HandoverItem,
  HandoverStatus,
  MemberCode,
  ModuleSlice,
  TaskCriterion,
  TaskDependency,
  TaskPriority,
  TaskStatus,
  TeamMember,
  TrackerTask,
} from '../types/tracker';

export const DEFAULT_SUPABASE_URL = 'https://mokcgiepgprmqghehbmv.supabase.co';
export const DEFAULT_SUPABASE_ANON_KEY =
  'sb_publishable_LP78rPHx83WrQSjqV0jTmA_i7UXGuYQ';

const MEMBER_AUTH_CREDENTIALS: Record<
  MemberCode,
  { email: string; pass: string }
> = {
  TV1: { email: 'buidangquangmtp@gmail.com', pass: '010605quang' },
  TV2: { email: 'nguyentrandinh.tn@gmail.com', pass: 'dtnguyen@' },
  TV3: { email: 'trongductai2005@gmail.com', pass: 'ttdtai123@' },
  TV4: { email: 'capntryisreal@gmail.com', pass: 'ntanh123@' },
};

export interface SupabaseEnvConfig {
  url: string;
  anonKey: string;
  workspaceSlug: string;
  isConfigured: boolean;
  missingVars: string[];
}

export function resolveSupabaseEnv(
  envSource?: Record<string, string | undefined>,
): SupabaseEnvConfig {
  const isTestMode =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.MODE === 'test';

  const env =
    envSource ??
    ((typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : {}) as Record<string, string | undefined>);

  const useBuiltInFallback = !envSource && !isTestMode;

  const rawUrl = (
    env.VITE_SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    (useBuiltInFallback ? DEFAULT_SUPABASE_URL : '')
  ).trim();
  const rawAnonKey = (
    env.VITE_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (useBuiltInFallback ? DEFAULT_SUPABASE_ANON_KEY : '')
  ).trim();
  const rawSlug = (
    env.VITE_DEFAULT_WORKSPACE_SLUG || DEFAULT_WORKSPACE_SLUG
  ).trim();

  const missingVars: string[] = [];
  if (!rawUrl) {
    missingVars.push('VITE_SUPABASE_URL');
  }
  if (!rawAnonKey) {
    missingVars.push('VITE_SUPABASE_ANON_KEY');
  }

  return {
    url: rawUrl,
    anonKey: rawAnonKey,
    workspaceSlug: rawSlug || DEFAULT_WORKSPACE_SLUG,
    isConfigured: Boolean(rawUrl && rawAnonKey),
    missingVars,
  };
}

let cachedClient: SupabaseClient | null = null;
let pendingSessionPromise: Promise<void> | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const config = resolveSupabaseEnv();
  if (!config.isConfigured) {
    return null;
  }
  if (!cachedClient) {
    cachedClient = createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
  }
  return cachedClient;
}

export async function ensureSupabaseMemberSession(
  client: SupabaseClient,
  memberCode: MemberCode | null,
): Promise<void> {
  if (
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.MODE === 'test'
  ) {
    return;
  }

  const targetCode: MemberCode = memberCode ?? 'TV1';
  const targetCred = MEMBER_AUTH_CREDENTIALS[targetCode];
  if (!targetCred) return;

  if (pendingSessionPromise) {
    await pendingSessionPromise;
  }

  const { data } = await client.auth.getSession();
  const currentEmail = data.session?.user?.email?.toLowerCase() ?? '';
  if (currentEmail === targetCred.email.toLowerCase()) {
    return;
  }

  pendingSessionPromise = (async () => {
    try {
      await client.auth.signInWithPassword({
        email: targetCred.email,
        password: targetCred.pass,
      });
    } finally {
      pendingSessionPromise = null;
    }
  })();

  await pendingSessionPromise;
}

export interface WorkspaceSnapshot {
  workspaceId: string;
  workspaceName: string;
  members: TeamMember[];
  tasks: TrackerTask[];
  handovers: HandoverItem[];
  auditLogs: AuditLogItem[];
}

export async function fetchWorkspaceDataFromSupabase(
  client: SupabaseClient,
  workspaceSlug: string = DEFAULT_WORKSPACE_SLUG,
  activeMember: MemberCode | null = null,
): Promise<WorkspaceSnapshot> {
  await ensureSupabaseMemberSession(client, activeMember);

  const { data: wsRow, error: wsError } = await client
    .from('workspaces')
    .select('*')
    .eq('slug', workspaceSlug)
    .maybeSingle();

  if (wsError) {
    throw new Error(wsError.message);
  }

  if (!wsRow) {
    throw new Error(
      `Workspace '${workspaceSlug}' chưa có dữ liệu trên Supabase (hãy chạy seed.sql) hoặc cần đăng nhập tài khoản thành viên để đọc.`,
    );
  }

  const workspaceId = String(wsRow.id);

  const [membersRes, tasksRes, criteriaRes, depsRes, handoversRes, logsRes] =
    await Promise.all([
      client
        .from('team_members')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('member_code'),
      client
        .from('tasks')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('day_number', { ascending: true }),
      client
        .from('task_criteria')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true }),
      client
        .from('task_dependencies')
        .select('*')
        .eq('workspace_id', workspaceId),
      client
        .from('handovers')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('id'),
      client
        .from('audit_logs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

  if (tasksRes.error) {
    throw new Error(tasksRes.error.message);
  }

  const seedDeliverablesByCode = new Map(
    SEED_TEAM_MEMBERS.map((m) => [m.memberCode, m.finalDeliverables]),
  );

  const members: TeamMember[] = (membersRes.data ?? []).map((row) => {
    const code = row.member_code as MemberCode;
    return {
      id: String(row.id),
      workspaceId: String(row.workspace_id),
      memberCode: code,
      displayName: String(row.display_name),
      email: String(row.email),
      sliceName: String(row.slice_name),
      crossRole: String(row.cross_role),
      colorHex: String(row.color_hex || '#3157d5'),
      avatarLabel: String(row.avatar_label || code.replace('TV', '')),
      isLead: Boolean(row.is_lead),
      finalDeliverables: seedDeliverablesByCode.get(code) ?? [],
    };
  });

  const criteriaByTask = new Map<string, TaskCriterion[]>();
  for (const row of criteriaRes.data ?? []) {
    const taskId = String(row.task_id);
    const list = criteriaByTask.get(taskId) ?? [];
    list.push({
      id: String(row.id),
      taskId,
      label: String(row.label),
      category: (row.category as CriterionCategory) || 'functional',
      isMandatory: Boolean(row.is_mandatory),
      isCompleted: Boolean(row.is_completed),
      completedBy: (row.completed_by as MemberCode | null) ?? null,
      completedAt: row.completed_at ? String(row.completed_at) : null,
      sortOrder: Number(row.sort_order ?? 1),
    });
    criteriaByTask.set(taskId, list);
  }

  const depsByTask = new Map<string, TaskDependency[]>();
  for (const row of depsRes.data ?? []) {
    const taskId = String(row.task_id);
    const list = depsByTask.get(taskId) ?? [];
    list.push({
      id: String(row.id),
      taskId,
      dependsOnTaskId: String(row.depends_on_task_id),
      dependencyType: row.dependency_type,
      note: String(row.note || ''),
    });
    depsByTask.set(taskId, list);
  }

  const tasks: TrackerTask[] = (tasksRes.data ?? []).map((row) => {
    const id = String(row.id);
    return {
      id,
      workspaceId: String(row.workspace_id || DEFAULT_WORKSPACE_ID),
      dayNumber: Number(row.day_number ?? 1),
      dayPhase: String(row.day_phase || ''),
      moduleSlice: (row.module_slice as ModuleSlice) || 'Onboarding',
      title: String(row.title),
      description: String(row.description),
      deliverableSummary: String(row.deliverable_summary || ''),
      ownerCode: row.owner_code as MemberCode,
      reviewerCode: row.reviewer_code as MemberCode,
      supporterCodes: (row.supporter_codes ?? []) as MemberCode[],
      handoverToCodes: (row.handover_to_codes ?? []) as MemberCode[],
      handoverCondition: String(row.handover_condition || ''),
      status: (row.status as TaskStatus) || 'todo',
      priority: (row.priority as TaskPriority) || 'P0',
      deadline: String(row.deadline),
      blocker: String(row.blocker || ''),
      isBlocked: Boolean(row.is_blocked),
      reviewerApproved: Boolean(row.reviewer_approved),
      reviewerApprovedBy: (row.reviewer_approved_by as MemberCode | null) ?? null,
      reviewerApprovedAt: row.reviewer_approved_at
        ? String(row.reviewer_approved_at)
        : null,
      reviewerNote: String(row.reviewer_note || ''),
      aiSuggestion: String(row.ai_suggestion || ''),
      aiConfidence: (row.ai_confidence as AIConfidence) || 'high',
      evidenceLinks: (row.evidence_links ?? []) as string[],
      notes: String(row.notes || ''),
      criteria: criteriaByTask.get(id) ?? [],
      dependencies: depsByTask.get(id) ?? [],
      updatedAt: String(row.updated_at || new Date().toISOString()),
    };
  });

  const handovers: HandoverItem[] = (handoversRes.data ?? []).map((row) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    taskId: String(row.task_id),
    fromMemberCode: row.from_member_code as MemberCode,
    toMemberCode: row.to_member_code as MemberCode,
    reviewerCode: row.reviewer_code as MemberCode,
    stageName: String(row.stage_name),
    inputRequired: String(row.input_required || ''),
    conditionText: String(row.condition_text || ''),
    status: (row.status as HandoverStatus) || 'pending',
    notes: String(row.notes || ''),
    updatedAt: String(row.updated_at || new Date().toISOString()),
  }));

  const auditLogs: AuditLogItem[] = (logsRes.data ?? []).map((row) => ({
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    taskId: row.task_id ? String(row.task_id) : null,
    actorCode: (row.actor_code as MemberCode) || 'SYSTEM',
    actorName: String(row.actor_name),
    actionType: (row.action_type as AuditActionType) || 'task_updated',
    summary: String(row.summary),
    createdAt: String(row.created_at),
  }));

  return {
    workspaceId,
    workspaceName: String(wsRow.name),
    members: members.length > 0 ? members : SEED_TEAM_MEMBERS,
    tasks,
    handovers,
    auditLogs,
  };
}

export function subscribeToWorkspaceRealtime(
  client: SupabaseClient,
  workspaceId: string,
  onRemoteChange: (tableName: string) => void,
  onStatusChange?: (status: 'connected' | 'connecting' | 'error') => void,
): () => void {
  onStatusChange?.('connecting');
  const channel = client
    .channel(`workspace-sync-${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => onRemoteChange('tasks'),
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'task_criteria',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => onRemoteChange('task_criteria'),
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'handovers',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => onRemoteChange('handovers'),
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'audit_logs',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      () => onRemoteChange('audit_logs'),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        onStatusChange?.('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        onStatusChange?.('error');
      }
    });

  return () => {
    void client.removeChannel(channel);
  };
}

export async function sync28DailyTasksToSupabase(
  client: SupabaseClient,
  workspaceId: string = DEFAULT_WORKSPACE_ID,
): Promise<{ ok: boolean; errorMessage?: string }> {
  // Upsert the 4 real team members
  const memberRows = SEED_TEAM_MEMBERS.map((m) => ({
    workspace_id: workspaceId,
    member_code: m.memberCode,
    display_name: m.displayName,
    email: m.email,
    slice_name: m.sliceName,
    cross_role: m.crossRole,
    color_hex: m.colorHex,
    avatar_label: m.avatarLabel,
    is_lead: m.isLead,
  }));

  await client
    .from('team_members')
    .upsert(memberRows, { onConflict: 'workspace_id,member_code' });

  // Delete old 9 condensed tasks if present
  await client
    .from('tasks')
    .delete()
    .in('id', [
      'T-TV1-01',
      'T-TV1-02',
      'T-TV2-01',
      'T-TV2-02',
      'T-TV3-01',
      'T-TV3-02',
      'T-TV4-01',
      'T-TV4-02',
      'T-ALL-09',
    ]);

  const taskRows = SEED_TASKS.map((t) => ({
    id: t.id,
    workspace_id: workspaceId,
    day_number: t.dayNumber,
    day_phase: t.dayPhase,
    module_slice: t.moduleSlice,
    title: t.title,
    description: t.description,
    deliverable_summary: t.deliverableSummary,
    owner_code: t.ownerCode,
    reviewer_code: t.reviewerCode,
    supporter_codes: t.supporterCodes,
    handover_to_codes: t.handoverToCodes,
    handover_condition: t.handoverCondition,
    status: 'todo',
    priority: t.priority,
    deadline: t.deadline,
    blocker: '',
    is_blocked: false,
    reviewer_approved: false,
    reviewer_approved_by: null,
    reviewer_approved_at: null,
    reviewer_note: '',
    ai_suggestion: t.aiSuggestion,
    ai_confidence: t.aiConfidence,
    evidence_links: [],
    notes: '',
  }));

  const { error: taskErr } = await client
    .from('tasks')
    .upsert(taskRows, { onConflict: 'id' });

  if (taskErr) {
    return { ok: false, errorMessage: taskErr.message };
  }

  const criteriaRows = SEED_TASKS.flatMap((t) =>
    t.criteria.map((c) => ({
      id: c.id,
      workspace_id: workspaceId,
      task_id: t.id,
      label: c.label,
      category: c.category,
      is_mandatory: c.isMandatory,
      is_completed: false,
      completed_by: null,
      completed_at: null,
      sort_order: c.sortOrder,
    })),
  );

  const { error: critErr } = await client
    .from('task_criteria')
    .upsert(criteriaRows, { onConflict: 'id' });

  if (critErr) {
    return { ok: false, errorMessage: critErr.message };
  }

  const handoverRows = SEED_HANDOVERS.map((h) => ({
    id: h.id,
    workspace_id: workspaceId,
    task_id: h.taskId,
    from_member_code: h.fromMemberCode,
    to_member_code: h.toMemberCode,
    reviewer_code: h.reviewerCode,
    stage_name: h.stageName,
    input_required: h.inputRequired,
    condition_text: h.conditionText,
    status: 'pending',
    notes: h.notes,
  }));

  await client.from('handovers').upsert(handoverRows, { onConflict: 'id' });

  return { ok: true };
}


