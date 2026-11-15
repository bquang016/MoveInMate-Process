import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  Bot,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Crown,
  Filter,
  FolderKanban,
  History,
  KeyRound,
  LayoutList,
  Lock,
  LogOut,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { NewTaskModal } from './components/NewTaskModal';
import { SupabaseSetupModal } from './components/SupabaseSetupModal';
import { TaskDetailModal } from './components/TaskDetailModal';
import { UserGuideView } from './components/UserGuideView';
import {
  DEFAULT_WORKSPACE_ID,
  SEED_AUDIT_LOGS,
  SEED_HANDOVERS,
  SEED_TASKS,
  SEED_TEAM_MEMBERS,
} from './data/seedData';
import {
  buildBlockerDiscordPayload,
  buildHandoverDiscordPayload,
  buildReviewerDecisionDiscordPayload,
  buildStatusChangeDiscordPayload,
  buildTaskProgressSavedDiscordPayload,
  isStatusRollback,
  sendDiscordNotification,
} from './lib/discord';
import {
  ensureSupabaseMemberSession,
  fetchWorkspaceDataFromSupabase,
  getSupabaseClient,
  resolveSupabaseEnv,
  subscribeToWorkspaceRealtime,
  sync28DailyTasksToSupabase,
} from './lib/supabase';
import {
  calculateProjectSummary,
  calculateTaskProgress,
  canMemberPerformAction,
  isAdminMember,
  isTaskOverdue,
  validateStatusTransition,
} from './lib/workflow';
import type {
  AuditActionType,
  AuditLogItem,
  CriterionCategory,
  HandoverItem,
  HandoverStatus,
  MemberCode,
  ModuleSlice,
  TaskCriterion,
  TaskPriority,
  TaskStatus,
  TeamMember,
  TrackerTask,
} from './types/tracker';

const STORAGE_KEYS = {
  tasks: 'moveinmate_tracker_tasks_v4_rbac',
  members: 'moveinmate_tracker_members_v4_rbac',
  handovers: 'moveinmate_tracker_handovers_v4_rbac',
  auditLogs: 'moveinmate_tracker_audit_v4_rbac',
  activeMember: 'moveinmate_tracker_active_member_v4_rbac',
};

const ALL_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review', 'done'];

const STATUS_META: Record<
  TaskStatus,
  { label: string; shortLabel: string; badgeClass: string }
> = {
  todo: {
    label: 'Todo · Chưa mở',
    shortLabel: 'Todo',
    badgeClass: 'status-todo',
  },
  in_progress: {
    label: 'In Progress · Đang làm',
    shortLabel: 'In Progress',
    badgeClass: 'status-in_progress',
  },
  review: {
    label: 'Review · Chờ kiểm duyệt',
    shortLabel: 'Review',
    badgeClass: 'status-review',
  },
  done: {
    label: 'Done · Hoàn thành',
    shortLabel: 'Done',
    badgeClass: 'status-done',
  },
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function App() {
  const envConfig = useMemo(() => resolveSupabaseEnv(), []);
  const supabaseClient = useMemo(() => getSupabaseClient(), []);

  // State: Workspace entities
  const [workspaceId, setWorkspaceId] = useState(DEFAULT_WORKSPACE_ID);
  const [members, setMembers] = useState<TeamMember[]>(() =>
    loadFromStorage(STORAGE_KEYS.members, SEED_TEAM_MEMBERS),
  );
  const [tasks, setTasks] = useState<TrackerTask[]>(() =>
    loadFromStorage(STORAGE_KEYS.tasks, SEED_TASKS),
  );
  const [handovers, setHandovers] = useState<HandoverItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.handovers, SEED_HANDOVERS),
  );
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(() =>
    loadFromStorage(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS),
  );

  // Active member / Auth state (Starts unauthenticated = null until user logs in)
  const [activeMember, setActiveMember] = useState<MemberCode | null>(() =>
    loadFromStorage<MemberCode | null>(STORAGE_KEYS.activeMember, null),
  );
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<
    'demo' | 'connecting' | 'connected' | 'error'
  >(envConfig.isConfigured ? 'connecting' : 'demo');
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  // Filters & Views
  const [activeTab, setActiveTab] = useState<
    'daily' | 'board' | 'list' | 'handover' | 'audit' | 'guide'
  >('daily');
  const [filterMember, setFilterMember] = useState<MemberCode | 'ALL'>('TV1');
  const [filterDay, setFilterDay] = useState<number | 'ALL'>('ALL');
  const [filterRelation, setFilterRelation] = useState<
    'any' | 'owner' | 'reviewer' | 'handover'
  >('owner');
  const [filterStatus, setFilterStatus] = useState<TaskStatus | 'ALL'>('ALL');
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'ALL'>(
    'ALL',
  );
  const [filterSlice, setFilterSlice] = useState<ModuleSlice | 'ALL'>('ALL');
  const [onlyBlockedOrOverdue, setOnlyBlockedOrOverdue] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Toasts
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [editingMemberCode, setEditingMemberCode] = useState<MemberCode | null>(
    null,
  );
  const [editingMemberName, setEditingMemberName] = useState('');
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
  } | null>(null);

  const showToast = useCallback(
    (
      message: string,
      type: 'success' | 'error' | 'warning' | 'info' = 'info',
    ) => {
      setToast({ message, type });
    },
    [],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Guard refs against Realtime echo race conditions overwriting in-flight saves
  const inFlightMutationsRef = useRef(0);
  const lastMutationTimeRef = useRef(0);
  const activeMemberRef = useRef<MemberCode | null>(activeMember);

  useEffect(() => {
    activeMemberRef.current = activeMember;
  }, [activeMember]);

  // Always persist to localStorage as an instant local cache & session store
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
      window.localStorage.setItem(
        STORAGE_KEYS.members,
        JSON.stringify(members),
      );
      window.localStorage.setItem(
        STORAGE_KEYS.handovers,
        JSON.stringify(handovers),
      );
      window.localStorage.setItem(
        STORAGE_KEYS.auditLogs,
        JSON.stringify(auditLogs),
      );
      window.localStorage.setItem(
        STORAGE_KEYS.activeMember,
        JSON.stringify(activeMember),
      );
    } catch {
      // ignore storage quota errors
    }
  }, [tasks, members, handovers, auditLogs, activeMember]);

  // Multi-tab real-time sync in Demo Mode via BroadcastChannel
  const broadcastDemoSync = useCallback(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return;
    }
    try {
      const bc = new BroadcastChannel('moveinmate_demo_realtime_channel');
      bc.postMessage({ type: 'SYNC_STATE', timestamp: Date.now() });
      bc.close();
    } catch {
      // ignore if BroadcastChannel unsupported
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) {
      return;
    }
    try {
      const bc = new BroadcastChannel('moveinmate_demo_realtime_channel');
      bc.onmessage = () => {
        if (
          inFlightMutationsRef.current > 0 ||
          Date.now() - lastMutationTimeRef.current < 1500
        ) {
          return;
        }
        setTasks(loadFromStorage(STORAGE_KEYS.tasks, SEED_TASKS));
        setMembers(loadFromStorage(STORAGE_KEYS.members, SEED_TEAM_MEMBERS));
        setHandovers(loadFromStorage(STORAGE_KEYS.handovers, SEED_HANDOVERS));
        setAuditLogs(loadFromStorage(STORAGE_KEYS.auditLogs, SEED_AUDIT_LOGS));
      };
      return () => bc.close();
    } catch {
      return undefined;
    }
  }, []);

  // Supabase Live Mode synchronization (Auth + DB + Realtime)
  const loadSupabaseWorkspace = useCallback(
    async (options?: { silent?: boolean; fromRealtime?: boolean }) => {
      if (!supabaseClient) return;
      if (
        options?.fromRealtime &&
        (inFlightMutationsRef.current > 0 ||
          Date.now() - lastMutationTimeRef.current < 2500)
      ) {
        return;
      }

      if (!options?.silent) {
        setLoadingRemote(true);
      }
      setRemoteError(null);
      try {
        const snapshot = await fetchWorkspaceDataFromSupabase(
          supabaseClient,
          envConfig.workspaceSlug,
          activeMemberRef.current,
        );

        // Guard again if a local save occurred while fetch was in flight
        if (
          options?.fromRealtime &&
          (inFlightMutationsRef.current > 0 ||
            Date.now() - lastMutationTimeRef.current < 2500)
        ) {
          return;
        }

        if (snapshot.tasks.length >= 28) {
          setWorkspaceId(snapshot.workspaceId);
          setMembers(snapshot.members);
          setTasks(snapshot.tasks);
          setHandovers(snapshot.handovers);
          setAuditLogs(snapshot.auditLogs);
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Không thể tải dữ liệu từ Supabase.';
        setRemoteError(msg);
      } finally {
        if (!options?.silent) {
          setLoadingRemote(false);
        }
      }
    },
    [supabaseClient, envConfig.workspaceSlug],
  );

  useEffect(() => {
    if (!supabaseClient) return;

    const storedMember = loadFromStorage<MemberCode | null>(
      STORAGE_KEYS.activeMember,
      null,
    );
    if (storedMember) {
      const matched = SEED_TEAM_MEMBERS.find(
        (m) => m.memberCode === storedMember,
      );
      if (matched) {
        setAuthEmail(matched.email);
      }
      void ensureSupabaseMemberSession(supabaseClient, storedMember);
    }

    void loadSupabaseWorkspace();
  }, [supabaseClient, loadSupabaseWorkspace]);

  useEffect(() => {
    if (!supabaseClient || !envConfig.isConfigured) return;
    const unsubscribe = subscribeToWorkspaceRealtime(
      supabaseClient,
      workspaceId,
      () => {
        void loadSupabaseWorkspace({ silent: true, fromRealtime: true });
      },
      (st) => setRealtimeStatus(st),
    );
    return unsubscribe;
  }, [supabaseClient, envConfig.isConfigured, workspaceId, loadSupabaseWorkspace]);

  // Helper: Get member display name
  const getMemberName = useCallback(
    (code: MemberCode | 'SYSTEM') => {
      if (code === 'SYSTEM') return 'Hệ thống';
      return (
        members.find((m) => m.memberCode === code)?.displayName || code
      );
    },
    [members],
  );

  // Append Audit Log helper
  const appendAudit = useCallback(
    (
      taskId: string | null,
      actionType: AuditActionType,
      summary: string,
      actorOverride?: MemberCode,
    ) => {
      const actor = actorOverride ?? activeMember ?? 'SYSTEM';
      const actorName = getMemberName(actor);
      const newEntry: AuditLogItem = {
        id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        workspaceId,
        taskId,
        actorCode: actor,
        actorName,
        actionType,
        summary,
        createdAt: new Date().toISOString(),
      };
      setAuditLogs((prev) => [newEntry, ...prev]);

      if (supabaseClient && envConfig.isConfigured) {
        void (async () => {
          inFlightMutationsRef.current += 1;
          lastMutationTimeRef.current = Date.now();
          try {
            await ensureSupabaseMemberSession(supabaseClient, activeMember);
            await supabaseClient.from('audit_logs').insert({
              workspace_id: workspaceId,
              task_id: taskId,
              actor_code: actor,
              actor_name: actorName,
              action_type: actionType,
              summary,
            });
          } finally {
            lastMutationTimeRef.current = Date.now();
            inFlightMutationsRef.current = Math.max(
              0,
              inFlightMutationsRef.current - 1,
            );
          }
        })();
      }
    },
    [activeMember, getMemberName, workspaceId, supabaseClient, envConfig.isConfigured],
  );

  // Actions: Toggle Criterion
  const handleToggleCriterion = useCallback(
    (taskId: string, criterionId: string) => {
      const targetTask = tasks.find((t) => t.id === taskId);
      if (!targetTask) return;

      const perm = canMemberPerformAction(
        targetTask,
        activeMember,
        'toggle_criterion',
      );
      if (!perm.allowed) {
        showToast(perm.reason || 'Không có quyền cập nhật checklist.', 'error');
        return;
      }

      const targetCrit = targetTask.criteria.find((c) => c.id === criterionId);
      if (!targetCrit) return;

      const nextCompleted = !targetCrit.isCompleted;
      const nowIso = new Date().toISOString();
      const updatedCriteria = targetTask.criteria.map((c) =>
        c.id === criterionId
          ? {
              ...c,
              isCompleted: nextCompleted,
              completedBy: nextCompleted ? activeMember : null,
              completedAt: nextCompleted ? nowIso : null,
            }
          : c,
      );
      const allUnchecked = updatedCriteria.every((c) => !c.isCompleted);

      // Auto-status rules:
      // 1. If task was 'done' and a mandatory criterion is unchecked -> revert to 'review'
      // 2. If task was 'todo' and a criterion is checked -> auto-promote to 'in_progress'
      // 3. If task was 'in_progress' and user unticks so all criteria are unchecked -> auto-revert back to 'todo'
      const nextTaskStatus: TaskStatus =
        targetTask.status === 'done' && !nextCompleted && targetCrit.isMandatory
          ? 'review'
          : targetTask.status === 'todo' && nextCompleted
          ? 'in_progress'
          : targetTask.status === 'in_progress' && !nextCompleted && allUnchecked
          ? 'todo'
          : targetTask.status;

      const updatedTaskSnapshot: TrackerTask = {
        ...targetTask,
        status: nextTaskStatus,
        criteria: updatedCriteria,
        updatedAt: nowIso,
      };

      lastMutationTimeRef.current = Date.now();
      setTasks((prev) =>
        prev.map((task) => (task.id === taskId ? updatedTaskSnapshot : task)),
      );

      if (supabaseClient && envConfig.isConfigured) {
        void (async () => {
          inFlightMutationsRef.current += 1;
          lastMutationTimeRef.current = Date.now();
          try {
            await ensureSupabaseMemberSession(supabaseClient, activeMember);
            await supabaseClient
              .from('task_criteria')
              .update({
                is_completed: nextCompleted,
                completed_by: nextCompleted ? activeMember : null,
                completed_at: nextCompleted ? nowIso : null,
              })
              .eq('id', criterionId);

            if (nextTaskStatus !== targetTask.status) {
              await supabaseClient
                .from('tasks')
                .update({ status: nextTaskStatus })
                .eq('id', taskId);
            }
          } finally {
            lastMutationTimeRef.current = Date.now();
            inFlightMutationsRef.current = Math.max(
              0,
              inFlightMutationsRef.current - 1,
            );
          }
        })();
      }

      appendAudit(
        taskId,
        'criteria_toggled',
        `${activeMember} đã ${
          nextCompleted ? 'tick hoàn thành' : 'bỏ tick'
        } tiêu chí "${targetCrit.label}" của task ${taskId}${
          nextTaskStatus !== targetTask.status
            ? ` (Trạng thái tự động chuyển sang ${STATUS_META[nextTaskStatus].shortLabel})`
            : ''
        }.`,
      );
      window.setTimeout(broadcastDemoSync, 50);
    },
    [
      tasks,
      activeMember,
      showToast,
      appendAudit,
      supabaseClient,
      envConfig.isConfigured,
      broadcastDemoSync,
    ],
  );

  // Action: Add Criterion
  const handleAddCriterion = useCallback(
    (
      taskId: string,
      label: string,
      category: CriterionCategory,
      isMandatory: boolean,
    ) => {
      const targetTask = tasks.find((t) => t.id === taskId);
      if (!targetTask) return;

      const perm = canMemberPerformAction(
        targetTask,
        activeMember,
        'edit_task',
      );
      if (!perm.allowed) {
        showToast(perm.reason || 'Không có quyền thêm tiêu chí.', 'error');
        return;
      }

      const newCritId = `C-${taskId}-${Date.now().toString().slice(-4)}`;
      const sortOrder = targetTask.criteria.length + 1;

      lastMutationTimeRef.current = Date.now();
      setTasks((prev) =>
        prev.map((task) =>
          task.id !== taskId
            ? task
            : {
                ...task,
                criteria: [
                  ...task.criteria,
                  {
                    id: newCritId,
                    taskId,
                    label,
                    category,
                    isMandatory,
                    isCompleted: false,
                    completedBy: null,
                    completedAt: null,
                    sortOrder,
                  },
                ],
                updatedAt: new Date().toISOString(),
              },
        ),
      );

      if (supabaseClient && envConfig.isConfigured) {
        void (async () => {
          inFlightMutationsRef.current += 1;
          lastMutationTimeRef.current = Date.now();
          try {
            await ensureSupabaseMemberSession(supabaseClient, activeMember);
            await supabaseClient.from('task_criteria').insert({
              id: newCritId,
              workspace_id: workspaceId,
              task_id: taskId,
              label,
              category,
              is_mandatory: isMandatory,
              is_completed: false,
              sort_order: sortOrder,
            });
          } finally {
            lastMutationTimeRef.current = Date.now();
            inFlightMutationsRef.current = Math.max(
              0,
              inFlightMutationsRef.current - 1,
            );
          }
        })();
      }

      appendAudit(
        taskId,
        'task_updated',
        `${activeMember} đã thêm tiêu chí đầu ra ${
          isMandatory ? 'bắt buộc' : 'tuỳ chọn'
        }: "${label}" vào ${taskId}.`,
      );
      window.setTimeout(broadcastDemoSync, 50);
    },
    [
      tasks,
      activeMember,
      showToast,
      appendAudit,
      supabaseClient,
      envConfig.isConfigured,
      workspaceId,
      broadcastDemoSync,
    ],
  );

  // Action: Change Task Status with Workflow Gate Enforcement
  const handleChangeStatus = useCallback(
    (
      taskId: string,
      nextStatus: TaskStatus,
      options?: { confirmIncompleteForReview?: boolean; note?: string },
    ): { ok: boolean; message?: string; requiresConfirmation?: boolean } => {
      const targetTask = tasks.find((t) => t.id === taskId);
      if (!targetTask) {
        return { ok: false, message: 'Không tìm thấy task.' };
      }

      const validation = validateStatusTransition(
        targetTask,
        nextStatus,
        activeMember,
        {
          confirmIncompleteForReview: options?.confirmIncompleteForReview,
        },
      );

      if (!validation.allowed) {
        if (!validation.requiresConfirmation) {
          showToast(
            validation.reason || 'Không đủ điều kiện chuyển trạng thái.',
            'error',
          );
        }
        return {
          ok: false,
          message: validation.reason,
          requiresConfirmation: validation.requiresConfirmation,
        };
      }

      const prevStatus = targetTask.status;
      if (prevStatus === nextStatus) {
        return { ok: true };
      }

      const rollback = isStatusRollback(prevStatus, nextStatus);
      const nowIso = new Date().toISOString();
      const updatedTaskSnapshot: TrackerTask = {
        ...targetTask,
        status: nextStatus,
        reviewerApproved:
          nextStatus === 'todo' ? false : targetTask.reviewerApproved,
        reviewerApprovedBy:
          nextStatus === 'todo' ? null : targetTask.reviewerApprovedBy,
        reviewerApprovedAt:
          nextStatus === 'todo' ? null : targetTask.reviewerApprovedAt,
        updatedAt: nowIso,
      };

      lastMutationTimeRef.current = Date.now();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? updatedTaskSnapshot : t)),
      );

      if (supabaseClient && envConfig.isConfigured) {
        void (async () => {
          inFlightMutationsRef.current += 1;
          lastMutationTimeRef.current = Date.now();
          try {
            await ensureSupabaseMemberSession(supabaseClient, activeMember);
            await supabaseClient
              .from('tasks')
              .update({
                status: nextStatus,
                ...(nextStatus === 'todo'
                  ? {
                      reviewer_approved: false,
                      reviewer_approved_by: null,
                      reviewer_approved_at: null,
                    }
                  : {}),
              })
              .eq('id', taskId);
          } finally {
            lastMutationTimeRef.current = Date.now();
            inFlightMutationsRef.current = Math.max(
              0,
              inFlightMutationsRef.current - 1,
            );
          }
        })();
      }

      const extraNote = options?.note ? ` (${options.note})` : '';
      appendAudit(
        taskId,
        'status_changed',
        `${activeMember} ${
          rollback ? 'hoàn tác trạng thái' : 'chuyển trạng thái'
        } ${taskId} từ ${STATUS_META[prevStatus].shortLabel} về ${
          STATUS_META[nextStatus].shortLabel
        }${extraNote}.`,
      );
      showToast(
        rollback
          ? `Đã hoàn tác trạng thái ${taskId} từ ${STATUS_META[prevStatus].shortLabel} về lại ${STATUS_META[nextStatus].shortLabel}.`
          : `Đã chuyển ${taskId} sang ${STATUS_META[nextStatus].shortLabel} (Đã đẩy thông báo Discord).`,
        rollback ? 'info' : 'success',
      );

      if (activeMember) {
        void sendDiscordNotification(
          buildStatusChangeDiscordPayload({
            task: updatedTaskSnapshot,
            prevStatus,
            nextStatus,
            actorCode: activeMember,
            actorName: getMemberName(activeMember),
            ownerName: getMemberName(targetTask.ownerCode),
            reviewerName: getMemberName(targetTask.reviewerCode),
            note: options?.note,
          }),
        );
      }

      window.setTimeout(broadcastDemoSync, 50);
      return { ok: true };
    },
    [
      tasks,
      activeMember,
      getMemberName,
      showToast,
      appendAudit,
      supabaseClient,
      envConfig.isConfigured,
      broadcastDemoSync,
    ],
  );

  // Action: Reviewer Approve / Request Changes
  const handleReviewerDecision = useCallback(
    (
      taskId: string,
      approved: boolean,
      note: string,
    ): { ok: boolean; message?: string } => {
      const targetTask = tasks.find((t) => t.id === taskId);
      if (!targetTask) {
        return { ok: false, message: 'Không tìm thấy task.' };
      }

      const perm = canMemberPerformAction(
        targetTask,
        activeMember,
        approved ? 'approve_review' : 'request_changes',
      );
      if (!perm.allowed) {
        showToast(
          perm.reason || 'Không có quyền thực hiện quyết định review.',
          'error',
        );
        return { ok: false, message: perm.reason };
      }

      const nowIso = new Date().toISOString();
      const finalNote =
        note ||
        (approved
          ? `Đã kiểm tra đầu ra và xác nhận đạt chuẩn bởi ${activeMember}.`
          : `Yêu cầu bổ sung thêm evidence/test bởi ${activeMember}.`);

      lastMutationTimeRef.current = Date.now();
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== taskId) return t;
          const nextStatus: TaskStatus =
            !approved && t.status === 'done' ? 'in_progress' : t.status;
          return {
            ...t,
            status: nextStatus,
            reviewerApproved: approved,
            reviewerApprovedBy: approved ? activeMember : null,
            reviewerApprovedAt: approved ? nowIso : null,
            reviewerNote: finalNote,
            updatedAt: nowIso,
          };
        }),
      );

      if (supabaseClient && envConfig.isConfigured) {
        void (async () => {
          inFlightMutationsRef.current += 1;
          lastMutationTimeRef.current = Date.now();
          try {
            await ensureSupabaseMemberSession(supabaseClient, activeMember);
            await supabaseClient
              .from('tasks')
              .update({
                reviewer_approved: approved,
                reviewer_approved_by: approved ? activeMember : null,
                reviewer_approved_at: approved ? nowIso : null,
                reviewer_note: finalNote,
              })
              .eq('id', taskId);
          } finally {
            lastMutationTimeRef.current = Date.now();
            inFlightMutationsRef.current = Math.max(
              0,
              inFlightMutationsRef.current - 1,
            );
          }
        })();
      }

      appendAudit(
        taskId,
        'reviewer_decision',
        `Reviewer ${activeMember} đã ${
          approved ? 'PHÊ DUYỆT (Approve)' : 'YÊU CẦU CHỈNH SỬA (Request Changes)'
        } cho task ${taskId}: "${finalNote}"`,
      );

      showToast(
        approved
          ? `Reviewer ${activeMember} đã Approve task ${taskId} (Đã thông báo Discord)!`
          : `Reviewer ${activeMember} đã gửi yêu cầu chỉnh sửa cho ${taskId}.`,
        approved ? 'success' : 'warning',
      );

      if (activeMember) {
        void sendDiscordNotification(
          buildReviewerDecisionDiscordPayload({
            task: targetTask,
            approved,
            note: finalNote,
            actorCode: activeMember,
            actorName: getMemberName(activeMember),
            ownerName: getMemberName(targetTask.ownerCode),
          }),
        );
      }

      window.setTimeout(broadcastDemoSync, 50);
      return { ok: true };
    },
    [
      tasks,
      activeMember,
      getMemberName,
      showToast,
      appendAudit,
      supabaseClient,
      envConfig.isConfigured,
      broadcastDemoSync,
    ],
  );

  // Action: Save All Task Detail Changes (Status, Checklist, Metadata, Blocker, Notes) & Send Discord Notification ONLY on Save
  const handleSaveTaskDetail = useCallback(
    (
      taskId: string,
      payload: {
        status: TaskStatus;
        criteria: TaskCriterion[];
        ownerCode: MemberCode;
        reviewerCode: MemberCode;
        handoverToCodes: MemberCode[];
        priority: TaskPriority;
        deadline: string;
        blocker: string;
        isBlocked: boolean;
        notes: string;
      },
    ): { ok: boolean; message?: string } => {
      const targetTask = tasks.find((t) => t.id === taskId);
      if (!targetTask) return { ok: false, message: 'Không tìm thấy task.' };

      const perm = canMemberPerformAction(
        targetTask,
        activeMember,
        'edit_task',
      );
      if (!perm.allowed) {
        showToast(perm.reason || 'Không có quyền chỉnh sửa task.', 'error');
        return { ok: false, message: perm.reason };
      }

      const candidateWithDraftCriteria: TrackerTask = {
        ...targetTask,
        criteria: payload.criteria,
      };

      if (payload.status !== targetTask.status) {
        const validation = validateStatusTransition(
          candidateWithDraftCriteria,
          payload.status,
          activeMember,
          { confirmIncompleteForReview: true },
        );
        if (!validation.allowed) {
          showToast(
            validation.reason || 'Không đủ điều kiện chuyển trạng thái.',
            'error',
          );
          return { ok: false, message: validation.reason };
        }
      }

      const prevStatus = targetTask.status;
      const nextStatus = payload.status;
      const statusChanged = prevStatus !== nextStatus;
      const rollback = statusChanged && isStatusRollback(prevStatus, nextStatus);
      const blockerChanged = payload.blocker !== targetTask.blocker;
      const prevCompletedCount = targetTask.criteria.filter(
        (c) => c.isCompleted,
      ).length;
      const nextCompletedCount = payload.criteria.filter(
        (c) => c.isCompleted,
      ).length;
      const criteriaChangedCount = payload.criteria.filter((c, idx) => {
        const orig = targetTask.criteria[idx];
        return !orig || orig.isCompleted !== c.isCompleted;
      }).length;

      const nowIso = new Date().toISOString();
      const updatedTaskSnapshot: TrackerTask = {
        ...targetTask,
        status: nextStatus,
        criteria: payload.criteria,
        ownerCode: payload.ownerCode,
        reviewerCode: payload.reviewerCode,
        handoverToCodes: payload.handoverToCodes,
        priority: payload.priority,
        deadline: payload.deadline,
        blocker: payload.blocker,
        isBlocked: payload.isBlocked,
        notes: payload.notes,
        reviewerApproved:
          nextStatus === 'todo' ? false : targetTask.reviewerApproved,
        reviewerApprovedBy:
          nextStatus === 'todo' ? null : targetTask.reviewerApprovedBy,
        reviewerApprovedAt:
          nextStatus === 'todo' ? null : targetTask.reviewerApprovedAt,
        updatedAt: nowIso,
      };

      lastMutationTimeRef.current = Date.now();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? updatedTaskSnapshot : t)),
      );

      // Summary for Audit Log
      const summaryParts: string[] = [];
      if (statusChanged) {
        summaryParts.push(
          `${rollback ? 'hoàn tác' : 'chuyển'} trạng thái ${
            STATUS_META[prevStatus].shortLabel
          } → ${STATUS_META[nextStatus].shortLabel}`,
        );
      }
      if (criteriaChangedCount > 0) {
        summaryParts.push(
          `cập nhật checklist (${nextCompletedCount}/${payload.criteria.length} hoàn thành)`,
        );
      }
      if (blockerChanged) {
        summaryParts.push(
          payload.blocker
            ? `báo Blocker "${payload.blocker}"`
            : 'gỡ Blocker',
        );
      }
      if (summaryParts.length === 0) {
        summaryParts.push('lưu cập nhật thông tin & ghi chú tiến độ');
      }

      if (supabaseClient && envConfig.isConfigured) {
        void (async () => {
          inFlightMutationsRef.current += 1;
          lastMutationTimeRef.current = Date.now();
          try {
            await ensureSupabaseMemberSession(supabaseClient, activeMember);

            // 1. Update changed criteria FIRST so workflow gate trigger sees updated mandatory criteria
            const criteriaUpdates = payload.criteria
              .filter((crit) => {
                const orig = targetTask.criteria.find((c) => c.id === crit.id);
                return !orig || orig.isCompleted !== crit.isCompleted;
              })
              .map((crit) =>
                supabaseClient
                  .from('task_criteria')
                  .update({
                    is_completed: crit.isCompleted,
                    completed_by: crit.completedBy,
                    completed_at: crit.completedAt,
                  })
                  .eq('id', crit.id),
              );

            if (criteriaUpdates.length > 0) {
              await Promise.all(criteriaUpdates);
            }

            // 2. Update the task row SECOND
            await supabaseClient
              .from('tasks')
              .update({
                status: nextStatus,
                owner_code: payload.ownerCode,
                reviewer_code: payload.reviewerCode,
                priority: payload.priority,
                deadline: payload.deadline,
                handover_to_codes: payload.handoverToCodes,
                blocker: payload.blocker,
                is_blocked: payload.isBlocked,
                notes: payload.notes,
                ...(nextStatus === 'todo'
                  ? {
                      reviewer_approved: false,
                      reviewer_approved_by: null,
                      reviewer_approved_at: null,
                    }
                  : {}),
              })
              .eq('id', taskId);
          } finally {
            lastMutationTimeRef.current = Date.now();
            inFlightMutationsRef.current = Math.max(
              0,
              inFlightMutationsRef.current - 1,
            );
          }
        })();
      }

      appendAudit(
        taskId,
        statusChanged
          ? 'status_changed'
          : blockerChanged
          ? 'blocker_updated'
          : 'task_updated',
        `${activeMember} đã bấm Lưu cập nhật ${taskId}: ${summaryParts.join(
          ', ',
        )}.`,
      );

      // Send Discord notification ONLY when user explicitly saves
      if (activeMember) {
        if (statusChanged) {
          void sendDiscordNotification(
            buildStatusChangeDiscordPayload({
              task: updatedTaskSnapshot,
              prevStatus,
              nextStatus,
              actorCode: activeMember,
              actorName: getMemberName(activeMember),
              ownerName: getMemberName(updatedTaskSnapshot.ownerCode),
              reviewerName: getMemberName(updatedTaskSnapshot.reviewerCode),
              note:
                criteriaChangedCount > 0
                  ? `Đã lưu checklist (${nextCompletedCount}/${payload.criteria.length} mục hoàn thành)${
                      payload.notes ? ` · Ghi chú: ${payload.notes}` : ''
                    }`
                  : payload.notes || undefined,
            }),
          );
        } else if (blockerChanged) {
          void sendDiscordNotification(
            buildBlockerDiscordPayload({
              task: updatedTaskSnapshot,
              blockerText: payload.blocker,
              actorCode: activeMember,
              actorName: getMemberName(activeMember),
            }),
          );
        } else {
          void sendDiscordNotification(
            buildTaskProgressSavedDiscordPayload({
              task: updatedTaskSnapshot,
              actorCode: activeMember,
              actorName: getMemberName(activeMember),
              ownerName: getMemberName(updatedTaskSnapshot.ownerCode),
              reviewerName: getMemberName(updatedTaskSnapshot.reviewerCode),
              summaryText:
                criteriaChangedCount > 0
                  ? `Cập nhật checklist từ ${prevCompletedCount}/${payload.criteria.length} lên ${nextCompletedCount}/${payload.criteria.length} tiêu chí hoàn thành.`
                  : payload.notes || 'Đã lưu cập nhật thông tin tiến độ task.',
            }),
          );
        }
      }

      window.setTimeout(broadcastDemoSync, 50);

      showToast(
        `Đã lưu cập nhật ${taskId} và gửi thông báo lên Discord!`,
        rollback ? 'info' : 'success',
      );

      return { ok: true };
    },
    [
      tasks,
      activeMember,
      getMemberName,
      showToast,
      appendAudit,
      supabaseClient,
      envConfig.isConfigured,
      broadcastDemoSync,
    ],
  );

  // Action: Create New Task
  const handleCreateTask = useCallback(
    (payload: {
      title: string;
      description: string;
      deliverableSummary: string;
      moduleSlice: ModuleSlice;
      dayNumber: number;
      ownerCode: MemberCode;
      reviewerCode: MemberCode;
      handoverToCodes: MemberCode[];
      handoverCondition: string;
      priority: TaskPriority;
      deadline: string;
      initialCriteria: string[];
    }) => {
      if (!activeMember) {
        showToast(
          'Vui lòng chọn thành viên đăng nhập trước khi tạo task mới.',
          'error',
        );
        return;
      }

      const newId = `T-${payload.ownerCode}-${String(tasks.length + 1).padStart(
        2,
        '0',
      )}`;
      const nowIso = new Date().toISOString();
      const criteria = payload.initialCriteria.map((label, idx) => ({
        id: `C-${newId}-${idx + 1}`,
        taskId: newId,
        label,
        category: 'functional' as CriterionCategory,
        isMandatory: true,
        isCompleted: false,
        completedBy: null,
        completedAt: null,
        sortOrder: idx + 1,
      }));

      const newTask: TrackerTask = {
        id: newId,
        workspaceId,
        dayNumber: payload.dayNumber,
        dayPhase: `Ngày ${payload.dayNumber} · Bổ sung Roadmap`,
        moduleSlice: payload.moduleSlice,
        title: payload.title,
        description: payload.description,
        deliverableSummary: payload.deliverableSummary,
        ownerCode: payload.ownerCode,
        reviewerCode: payload.reviewerCode,
        supporterCodes: [],
        handoverToCodes: payload.handoverToCodes,
        handoverCondition: payload.handoverCondition,
        status: 'todo',
        priority: payload.priority,
        deadline: payload.deadline,
        blocker: '',
        isBlocked: false,
        reviewerApproved: false,
        reviewerApprovedBy: null,
        reviewerApprovedAt: null,
        reviewerNote: '',
        aiSuggestion: `AI Gợi ý: Task mới tạo cho ${payload.ownerCode}. Hãy hoàn thành ${criteria.length} tiêu chí bắt buộc trước khi gửi ${payload.reviewerCode} review.`,
        aiConfidence: 'high',
        evidenceLinks: [],
        notes: '',
        criteria,
        dependencies: [],
        updatedAt: nowIso,
      };

      setTasks((prev) => [...prev, newTask]);
      appendAudit(
        newId,
        'task_updated',
        `${activeMember} đã tạo task mới ${newId} (${payload.title}), giao cho ${payload.ownerCode}, reviewer ${payload.reviewerCode}.`,
      );
      showToast(`Đã tạo task mới ${newId} thành công!`, 'success');

      if (!envConfig.isConfigured) {
        window.setTimeout(broadcastDemoSync, 50);
      }
    },
    [
      activeMember,
      tasks.length,
      workspaceId,
      appendAudit,
      showToast,
      envConfig.isConfigured,
      broadcastDemoSync,
    ],
  );

  // Action: Update Handover Status
  const handleUpdateHandoverStatus = useCallback(
    (handoverId: string, nextStatus: HandoverStatus) => {
      if (!activeMember) {
        showToast(
          'Vui lòng đăng nhập tài khoản thành viên để cập nhật trạng thái bàn giao.',
          'error',
        );
        return;
      }
      const target = handovers.find((h) => h.id === handoverId);
      if (!target) return;

      const isAllowedHandoverActor =
        isAdminMember(activeMember) ||
        activeMember === target.fromMemberCode ||
        activeMember === target.toMemberCode ||
        activeMember === target.reviewerCode;

      if (!isAllowedHandoverActor) {
        showToast(
          `Phân quyền: Chỉ ${target.fromMemberCode}, ${target.toMemberCode}, Reviewer ${target.reviewerCode} hoặc Admin (TV1) mới được cập nhật điểm bàn giao này.`,
          'error',
        );
        return;
      }

      const prevHandoverStatus = target.status;
      if (prevHandoverStatus === nextStatus) return;

      const nowIso = new Date().toISOString();
      setHandovers((prev) =>
        prev.map((h) =>
          h.id === handoverId
            ? { ...h, status: nextStatus, updatedAt: nowIso }
            : h,
        ),
      );

      appendAudit(
        target.taskId,
        'handover_updated',
        `${activeMember} cập nhật điểm giao "${target.stageName}" (${target.fromMemberCode} → ${target.toMemberCode}) sang trạng thái ${nextStatus}.`,
      );
      showToast(
        `Đã cập nhật điểm bàn giao ${target.id} sang ${nextStatus}.`,
        'success',
      );

      void sendDiscordNotification(
        buildHandoverDiscordPayload({
          handover: target,
          prevStatus: prevHandoverStatus,
          nextStatus,
          actorCode: activeMember,
          actorName: getMemberName(activeMember),
        }),
      );

      if (supabaseClient && envConfig.isConfigured) {
        void supabaseClient
          .from('handovers')
          .update({ status: nextStatus })
          .eq('id', handoverId);
      } else {
        window.setTimeout(broadcastDemoSync, 50);
      }
    },
    [
      activeMember,
      getMemberName,
      handovers,
      appendAudit,
      showToast,
      supabaseClient,
      envConfig.isConfigured,
      broadcastDemoSync,
    ],
  );

  // Action: Rename Member Display Name (Only self or Admin TV1)
  const handleSaveMemberName = (code: MemberCode) => {
    if (!activeMember || (!isAdminMember(activeMember) && activeMember !== code)) {
      showToast(
        `Chỉ chính chủ (${code}) hoặc Admin (TV1) mới được đổi tên hiển thị.`,
        'error',
      );
      setEditingMemberCode(null);
      return;
    }
    if (!editingMemberName.trim()) {
      setEditingMemberCode(null);
      return;
    }
    setMembers((prev) =>
      prev.map((m) =>
        m.memberCode === code
          ? { ...m, displayName: editingMemberName.trim() }
          : m,
      ),
    );
    setEditingMemberCode(null);
    showToast(`Đã cập nhật tên hiển thị cho ${code}.`, 'success');
  };

  // Action: Reset Demo Data / Reset 28 Daily Tasks to 0% (Admin TV1 only)
  const handleResetDemoData = async () => {
    if (!isAdminMember(activeMember)) {
      showToast(
        'Chỉ tài khoản Admin (TV1 · Bùi Đăng Quang) mới có quyền Reset dữ liệu dự án.',
        'error',
      );
      return;
    }
    setTasks(SEED_TASKS);
    setMembers(SEED_TEAM_MEMBERS);
    setHandovers(SEED_HANDOVERS);
    setAuditLogs(SEED_AUDIT_LOGS);
    setFilterDay('ALL');
    if (supabaseClient && envConfig.isConfigured) {
      await sync28DailyTasksToSupabase(supabaseClient, workspaceId);
    }
    showToast(
      'Đã khởi tạo / đặt lại toàn bộ 28 Task (Ngày 1–7 cho TV1–TV4) về 0% (Todo).',
      'info',
    );
    window.setTimeout(broadcastDemoSync, 50);
  };

  // Supabase Auth Sign-in / Sign-out handlers
  const handleSupabaseSignIn = async (
    email: string,
    password: string,
  ): Promise<{ ok: boolean; message: string }> => {
    const matched = members.find(
      (m) => m.email.toLowerCase() === email.trim().toLowerCase(),
    );

    if (!matched) {
      return {
        ok: false,
        message:
          'Email này không thuộc danh sách 4 thành viên (TV1–TV4) của dự án MoveInMate.',
      };
    }

    if (supabaseClient && import.meta.env.MODE !== 'test') {
      const { error } = await supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        return {
          ok: false,
          message:
            error.message === 'Invalid login credentials'
              ? 'Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.'
              : error.message,
        };
      }
    }

    setAuthEmail(matched.email);
    setActiveMember(matched.memberCode);
    setFilterMember(matched.memberCode);
    setFilterRelation('owner');
    showToast(
      `Xin chào ${matched.displayName}${
        matched.memberCode === 'TV1' ? ' (Quyền Admin Toàn hệ thống)' : ''
      }!`,
      'success',
    );
    return {
      ok: true,
      message: `Đã đăng nhập thành công với tài khoản ${matched.displayName}.`,
    };
  };

  const handleSupabaseSignOut = async () => {
    if (supabaseClient && import.meta.env.MODE !== 'test') {
      await supabaseClient.auth.signOut();
    }
    setAuthEmail(null);
    setActiveMember(null);
    showToast('Đã đăng xuất tài khoản. Hệ thống chuyển về Chế độ Xem.', 'info');
  };

  // Derived Metrics & Filtered Tasks
  const projectSummary = useMemo(
    () => calculateProjectSummary(tasks),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filterMember !== 'ALL') {
        if (filterRelation === 'owner' && task.ownerCode !== filterMember) {
          return false;
        }
        if (
          filterRelation === 'reviewer' &&
          task.reviewerCode !== filterMember
        ) {
          return false;
        }
        if (
          filterRelation === 'handover' &&
          !task.handoverToCodes.includes(filterMember)
        ) {
          return false;
        }
        if (
          filterRelation === 'any' &&
          task.ownerCode !== filterMember &&
          task.reviewerCode !== filterMember &&
          !task.handoverToCodes.includes(filterMember)
        ) {
          return false;
        }
      }

      if (filterDay !== 'ALL' && task.dayNumber !== filterDay) {
        return false;
      }

      if (filterStatus !== 'ALL' && task.status !== filterStatus) {
        return false;
      }

      if (filterPriority !== 'ALL' && task.priority !== filterPriority) {
        return false;
      }

      if (filterSlice !== 'ALL' && task.moduleSlice !== filterSlice) {
        return false;
      }

      if (onlyBlockedOrOverdue) {
        const blocked = task.isBlocked || task.blocker.trim().length > 0;
        const overdue = isTaskOverdue(task);
        if (!blocked && !overdue) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay =
          `${task.id} ${task.title} ${task.description} ${task.deliverableSummary} ${task.blocker} ${task.ownerCode} ${task.reviewerCode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [
    tasks,
    filterMember,
    filterDay,
    filterRelation,
    filterStatus,
    filterPriority,
    filterSlice,
    onlyBlockedOrOverdue,
    searchQuery,
  ]);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) ?? null,
    [tasks, selectedTaskId],
  );

  const activeBlockedTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          t.status !== 'done' && (t.isBlocked || t.blocker.trim().length > 0),
      ),
    [tasks],
  );

  return (
    <div className="app-shell">
      {/* Top Mode & Realtime Status Bar */}
      <div
        className={`top-mode-bar ${
          envConfig.isConfigured ? 'mode-live' : 'mode-demo'
        }`}
        role="region"
        aria-label="Trạng thái môi trường và kết nối thời gian thực"
      >
        <div className="container mode-bar-inner">
          <div className="mode-bar-left">
            {envConfig.isConfigured ? (
              <>
                <span className="status-dot dot-live" />
                <strong>Supabase Live Mode</strong>
                <span className="mode-divider">|</span>
                <span>
                  Realtime:{' '}
                  <strong>
                    {realtimeStatus === 'connected'
                      ? 'Đã kết nối'
                      : realtimeStatus === 'connecting'
                      ? 'Đang kết nối...'
                      : 'Lỗi kết nối'}
                  </strong>
                </span>
              </>
            ) : (
              <>
                <span className="status-dot dot-demo" />
                <strong>Chế độ Demo Mode (An toàn)</strong>
                <span className="mode-divider">|</span>
                <span>
                  Chưa cấu hình <code>.env</code> Supabase — Đang chạy dữ liệu
                  giả lập MoveInMate VHR-16 & đồng bộ đa tab thời gian thực.
                </span>
              </>
            )}
          </div>

          <div className="mode-bar-right">
            <button
              type="button"
              className="bar-link-btn"
              onClick={() => setActiveTab('guide')}
              title="Mở trang Hướng dẫn Sử dụng tính năng chi tiết"
            >
              <BookOpen size={13} /> Hướng dẫn Sử dụng
            </button>
            {isAdminMember(activeMember) && (
              <button
                type="button"
                className="bar-link-btn"
                onClick={() => void handleResetDemoData()}
                title="Chỉ Admin (TV1) mới có quyền Reset 28 Task về 0%"
              >
                <RotateCcw size={13} /> Reset 28 Task về 0%
              </button>
            )}
            {envConfig.isConfigured && (
              <button
                type="button"
                className="bar-link-btn"
                onClick={() => void loadSupabaseWorkspace()}
              >
                <RefreshCw size={13} /> Đồng bộ ngay
              </button>
            )}
            {activeMember ? (
              <>
                <span className="bar-user-pill">
                  {isAdminMember(activeMember) ? (
                    <Crown size={13} />
                  ) : (
                    <UserCheck size={13} />
                  )}
                  <strong>{getMemberName(activeMember)}</strong>
                  {isAdminMember(activeMember) && (
                    <span className="bar-admin-tag">ADMIN</span>
                  )}
                </span>
                <button
                  type="button"
                  className="bar-link-btn"
                  onClick={() => setIsNewTaskModalOpen(true)}
                >
                  <Plus size={13} /> Thêm Task
                </button>
                <button
                  type="button"
                  className="bar-link-btn highlight"
                  onClick={() => setIsSetupModalOpen(true)}
                >
                  <KeyRound size={13} /> Đổi tài khoản
                </button>
                <button
                  type="button"
                  className="bar-link-btn"
                  onClick={() => void handleSupabaseSignOut()}
                >
                  <LogOut size={13} /> Đăng xuất
                </button>
              </>
            ) : (
              <button
                type="button"
                className="bar-link-btn highlight"
                onClick={() => setIsSetupModalOpen(true)}
              >
                <KeyRound size={13} /> Đăng nhập Thành viên
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div className={`toast-floating toast-${toast.type}`} role="alert">
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Đóng thông báo"
          >
            ×
          </button>
        </div>
      )}

      {/* Main Header (Removed old session-card role switcher) */}
      <header className="app-header">
        <div className="container">
          <div className="brand-block">
            <div className="eyebrow-row">
              <span className="eyebrow-pill">VHR-16 · 7-Day MVP Playbook</span>
              <span className="eyebrow-pill pill-outline">
                4 Vertical Slices · Phân quyền theo Tài khoản & Admin
              </span>
            </div>
            <h1>MoveInMate AI — Team Progress Tracker</h1>
            <p className="subtitle">
              Hệ thống cộng tác theo dõi tiến độ, checklist tiêu chí đầu ra,
              điểm giao bàn giao và cổng kiểm duyệt Reviewer theo thời gian thực
              cho 4 thành viên <strong>TV1–TV4</strong>.
            </p>
          </div>
        </div>
      </header>

      <main className="container main-content">
        {/* Read-Only Banner when not logged in */}
        {activeMember === null && (
          <div className="rls-guard-banner" role="alert">
            <ShieldAlert size={22} />
            <div className="rls-guard-content">
              <div>
                <strong>Chế độ Xem (Chưa đăng nhập tài khoản):</strong> Bạn có
                thể xem tiến độ và lộ trình 7 ngày của tất cả thành viên. Để
                tick checklist, đổi trạng thái hoặc duyệt Review trên phần công
                việc của mình, vui lòng đăng nhập đúng tài khoản thành viên
                (hoặc tài khoản Admin TV1).
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setIsSetupModalOpen(true)}
              >
                <KeyRound size={14} /> Đăng nhập ngay
              </button>
            </div>
          </div>
        )}

        {/* Loading or Remote Error State */}
        {loadingRemote && (
          <div className="state-banner state-loading" role="status">
            <RefreshCw size={18} className="spin-icon" />
            <span>Đang đồng bộ dữ liệu thời gian thực từ Supabase...</span>
          </div>
        )}
        {remoteError && (
          <div className="state-banner state-error" role="alert">
            <AlertOctagon size={18} />
            <span>
              Lỗi kết nối Supabase: {remoteError}. Ứng dụng vẫn giữ trạng thái
              an toàn trên trình duyệt.
            </span>
          </div>
        )}

        {/* Section 1: Overall Progress & KPI Summary */}
        <section
          className="dashboard-panel"
          aria-labelledby="dashboard-heading"
        >
          <div className="dashboard-top-row">
            <div>
              <span className="section-eyebrow">01 · Real-time Overview</span>
              <h2 id="dashboard-heading">
                Tiến độ Toàn Dự án MoveInMate ({projectSummary.overallPercent}%)
              </h2>
            </div>
            <div className="overall-criteria-counter">
              <ClipboardCheck size={18} />
              <span>
                Đã hoàn thành{' '}
                <strong>
                  {projectSummary.completedCriteria}/
                  {projectSummary.totalCriteria}
                </strong>{' '}
                tiêu chí đầu ra trên toàn bộ {projectSummary.totalTasks} tasks
              </span>
            </div>
          </div>

          <div
            className="overall-progress-track"
            role="progressbar"
            aria-valuenow={projectSummary.overallPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Tiến độ hoàn thành toàn dự án"
          >
            <div
              className="overall-progress-fill"
              style={{ width: `${projectSummary.overallPercent}%` }}
            />
          </div>

          {/* 6 KPI Counters */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Todo (Chưa mở)</span>
              <strong className="kpi-value">{projectSummary.todoCount}</strong>
              <small>Chờ khởi động</small>
            </div>
            <div className="kpi-card kpi-inprogress">
              <span className="kpi-label">In Progress</span>
              <strong className="kpi-value">
                {projectSummary.inProgressCount}
              </strong>
              <small>Đang triển khai</small>
            </div>
            <div className="kpi-card kpi-review">
              <span className="kpi-label">Review (Chờ duyệt)</span>
              <strong className="kpi-value">
                {projectSummary.reviewCount}
              </strong>
              <small>Cần Reviewer xác nhận</small>
            </div>
            <div className="kpi-card kpi-done">
              <span className="kpi-label">Done (Hoàn tất)</span>
              <strong className="kpi-value">{projectSummary.doneCount}</strong>
              <small>Đủ tiêu chí & đã Approve</small>
            </div>
            <div className="kpi-card kpi-overdue">
              <span className="kpi-label">Task Quá hạn</span>
              <strong className="kpi-value">
                {projectSummary.overdueCount}
              </strong>
              <small>Cần ưu tiên xử lý</small>
            </div>
            <div className="kpi-card kpi-blocked">
              <span className="kpi-label">Đang có Blocker</span>
              <strong className="kpi-value">
                {projectSummary.blockedCount}
              </strong>
              <small>Cần gỡ vướng mắc</small>
            </div>
          </div>

          {/* 4 Member Progress Cards (TV1 - TV4) */}
          <div className="member-grid">
            {members.map((member) => {
              const stat =
                projectSummary.memberSummaries[member.memberCode] ?? {
                  completionPercent: 0,
                  doneTasks: 0,
                  totalTasks: 0,
                  reviewTasks: 0,
                  inProgressTasks: 0,
                  todoTasks: 0,
                  completedCriteria: 0,
                  totalCriteria: 0,
                  reviewQueueCount: 0,
                  blockedTasks: 0,
                };
              const isSelectedFilter = filterMember === member.memberCode;

              return (
                <article
                  key={member.memberCode}
                  className={`member-card ${
                    isSelectedFilter ? 'member-card-selected' : ''
                  }`}
                  style={
                    {
                      '--member-color': member.colorHex,
                    } as React.CSSProperties
                  }
                >
                  <div className="member-card-top">
                    <div className="member-avatar">{member.avatarLabel}</div>
                    <div className="member-title-wrap">
                      {editingMemberCode === member.memberCode ? (
                        <div className="inline-rename-row">
                          <input
                            type="text"
                            value={editingMemberName}
                            onChange={(e) =>
                              setEditingMemberName(e.target.value)
                            }
                            aria-label={`Đổi tên ${member.memberCode}`}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
                            onClick={() =>
                              handleSaveMemberName(member.memberCode)
                            }
                          >
                            Lưu
                          </button>
                        </div>
                      ) : (
                        <h3
                          onDoubleClick={() => {
                            setEditingMemberCode(member.memberCode);
                            setEditingMemberName(member.displayName);
                          }}
                          title="Nhấp đúp để đổi tên thành viên"
                        >
                          {member.displayName}
                        </h3>
                      )}
                      <span className="member-slice-label">
                        {member.sliceName}
                      </span>
                    </div>
                    <strong className="member-percent">
                      {stat.completionPercent}%
                    </strong>
                  </div>

                  <div
                    className="member-progress-bar"
                    role="progressbar"
                    aria-valuenow={stat.completionPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Tiến độ của ${member.memberCode}`}
                  >
                    <div
                      className="member-progress-fill"
                      style={{ width: `${stat.completionPercent}%` }}
                    />
                  </div>

                  <p className="member-cross-role">{member.crossRole}</p>

                  <div className="member-stat-pills">
                    <span>
                      Done: <strong>{stat.doneTasks}/{stat.totalTasks}</strong>
                    </span>
                    <span>
                      Checklist:{' '}
                      <strong>
                        {stat.completedCriteria}/{stat.totalCriteria}
                      </strong>
                    </span>
                    {stat.reviewQueueCount > 0 && (
                      <span className="pill-attention">
                        Cần review: {stat.reviewQueueCount}
                      </span>
                    )}
                    {stat.blockedTasks > 0 && (
                      <span className="pill-danger">
                        Blocker: {stat.blockedTasks}
                      </span>
                    )}
                  </div>

                  <div className="member-card-footer">
                    <button
                      type="button"
                      className="btn-link-filter"
                      onClick={() =>
                        setFilterMember((prev) =>
                          prev === member.memberCode ? 'ALL' : member.memberCode,
                        )
                      }
                    >
                      {isSelectedFilter
                        ? 'Đang lọc · Bỏ lọc'
                        : `Lọc task của ${member.memberCode}`}
                    </button>
                    <button
                      type="button"
                      className="btn-link-rename"
                      onClick={() => {
                        setEditingMemberCode(member.memberCode);
                        setEditingMemberName(member.displayName);
                      }}
                    >
                      Đổi tên
                    </button>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Active Blockers Alert Strip */}
          {activeBlockedTasks.length > 0 && (
            <div className="blocker-strip">
              <div className="blocker-strip-title">
                <AlertTriangle size={18} />
                <strong>
                  Cảnh báo Blocker đang mở ({activeBlockedTasks.length}):
                </strong>
              </div>
              <div className="blocker-strip-items">
                {activeBlockedTasks.map((bt) => (
                  <button
                    key={bt.id}
                    type="button"
                    className="blocker-chip"
                    onClick={() => setSelectedTaskId(bt.id)}
                  >
                    <strong>
                      {bt.id} ({bt.ownerCode} → {bt.reviewerCode}):
                    </strong>{' '}
                    {bt.blocker}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Navigation Tabs & Filter Bar */}
        <section className="workspace-section">
          <div className="view-tabs-bar">
            <div className="view-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'daily'}
                className={`view-tab-btn ${
                  activeTab === 'daily' ? 'active' : ''
                }`}
                onClick={() => setActiveTab('daily')}
              >
                <CalendarDays size={16} /> Lộ trình 7 Ngày (Theo Ngày & Thành viên)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'board'}
                className={`view-tab-btn ${
                  activeTab === 'board' ? 'active' : ''
                }`}
                onClick={() => setActiveTab('board')}
              >
                <FolderKanban size={16} /> Task Board (Kanban)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'list'}
                className={`view-tab-btn ${
                  activeTab === 'list' ? 'active' : ''
                }`}
                onClick={() => setActiveTab('list')}
              >
                <LayoutList size={16} /> Bảng Tổng hợp ({filteredTasks.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'handover'}
                className={`view-tab-btn ${
                  activeTab === 'handover' ? 'active' : ''
                }`}
                onClick={() => setActiveTab('handover')}
              >
                <ArrowRightLeft size={16} /> Điểm giao Bàn giao & Quality Gates
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'audit'}
                className={`view-tab-btn ${
                  activeTab === 'audit' ? 'active' : ''
                }`}
                onClick={() => setActiveTab('audit')}
              >
                <History size={16} /> Lịch sử Cập nhật ({auditLogs.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'guide'}
                className={`view-tab-btn ${
                  activeTab === 'guide' ? 'active' : ''
                }`}
                onClick={() => setActiveTab('guide')}
              >
                <BookOpen size={16} /> Hướng dẫn Sử dụng
              </button>
            </div>
          </div>

          {/* Member & Day Selector Bar (Always visible on Daily, Board, and List tabs) */}
          {(activeTab === 'daily' ||
            activeTab === 'board' ||
            activeTab === 'list') && (
            <div className="roadmap-selector-panel">
              <div className="roadmap-member-tabs" role="group" aria-label="Chọn lộ trình thành viên">
                {members.map((m) => {
                  const mStat = projectSummary.memberSummaries[m.memberCode];
                  const isActive = filterMember === m.memberCode;
                  return (
                    <button
                      key={m.memberCode}
                      type="button"
                      style={{ '--tab-color': m.colorHex } as React.CSSProperties}
                      className={`roadmap-member-tab ${isActive ? 'active' : ''}`}
                      onClick={() => {
                        setFilterMember(m.memberCode);
                        setFilterRelation('owner');
                      }}
                    >
                      <span>{m.memberCode} · {m.sliceName.split('&')[0]}</span>
                      <small>{mStat?.completionPercent ?? 0}% (7 ngày)</small>
                    </button>
                  );
                })}
                <button
                  type="button"
                  style={{ '--tab-color': '#172033' } as React.CSSProperties}
                  className={`roadmap-member-tab ${filterMember === 'ALL' ? 'active' : ''}`}
                  onClick={() => setFilterMember('ALL')}
                >
                  <span>Cả 4 Thành viên</span>
                  <small>{tasks.length} tasks (Ngày 1–7)</small>
                </button>
              </div>

              {/* Day Filter Pills (Ngày 1 -> Ngày 7) */}
              <div className="day-selector-row" role="group" aria-label="Lọc theo ngày thực hiện">
                <button
                  type="button"
                  className={`day-pill-btn ${filterDay === 'ALL' ? 'active' : ''}`}
                  onClick={() => setFilterDay('ALL')}
                >
                  Tất cả 7 Ngày
                </button>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const dayTasks = tasks.filter(
                    (t) =>
                      t.dayNumber === d &&
                      (filterMember === 'ALL' || t.ownerCode === filterMember),
                  );
                  const doneInDay = dayTasks.filter((t) => t.status === 'done').length;
                  const inProgInDay = dayTasks.filter(
                    (t) => t.status === 'in_progress' || t.status === 'review',
                  ).length;

                  return (
                    <button
                      key={d}
                      type="button"
                      className={`day-pill-btn ${filterDay === d ? 'active' : ''} ${
                        doneInDay > 0 && doneInDay === dayTasks.length
                          ? 'day-complete'
                          : inProgInDay > 0
                          ? 'day-inprog'
                          : ''
                      }`}
                      onClick={() =>
                        setFilterDay((prev) => (prev === d ? 'ALL' : d))
                      }
                    >
                      <span>Ngày {d}</span>
                      <small>
                        {doneInDay}/{dayTasks.length} Done
                      </small>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 0: VISUAL 7-DAY TIMELINE PER MEMBER (Supports working ahead on Day 2, 3...) */}
          {activeTab === 'daily' && (
            <div className="daily-roadmap-container">
              {filterMember !== 'ALL' && (
                (() => {
                  const mInfo = members.find((m) => m.memberCode === filterMember);
                  if (!mInfo) return null;
                  return (
                    <div
                      className="member-roadmap-banner"
                      style={{ '--member-color': mInfo.colorHex } as React.CSSProperties}
                    >
                      <div className="member-role-summary">
                        <h3>{mInfo.displayName}</h3>
                        <p>
                          <strong>Vertical Slice:</strong> {mInfo.sliceName} ·{' '}
                          <strong>Vai trò chung:</strong> {mInfo.crossRole}
                        </p>
                        <p className="fast-forward-tip">
                          ⚡ <strong>Cơ chế Vượt tiến độ:</strong> Nếu {mInfo.memberCode}{' '}
                          hoàn thành sớm Ngày 1, bạn có thể bấm{' '}
                          <strong>“Bắt đầu làm ngay”</strong> hoặc tick trực tiếp
                          checklist ở <strong>Ngày 2, Ngày 3, Ngày 4...</strong> mà
                          không cần chờ ngày tiếp theo.
                        </p>
                      </div>
                      <div className="member-final-outputs">
                        <h4>Đầu ra cuối cùng của {mInfo.memberCode}</h4>
                        <ul>
                          {mInfo.finalDeliverables.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                })()
              )}

              <div className="daily-timeline-list">
                {filteredTasks.map((task) => {
                  const metrics = calculateTaskProgress(task);
                  const editPerm = canMemberPerformAction(
                    task,
                    activeMember,
                    'edit_task',
                  );
                  const reviewPerm = canMemberPerformAction(
                    task,
                    activeMember,
                    'approve_review',
                  );
                  const memberColor =
                    members.find((m) => m.memberCode === task.ownerCode)
                      ?.colorHex || '#3157d5';

                  return (
                    <article
                      key={task.id}
                      className={`daily-card status-border-${task.status}`}
                      style={{ '--member-color': memberColor } as React.CSSProperties}
                    >
                      {/* Col 1: Day Badge & Status */}
                      <div className="daily-card-day">
                        <span className="day-number-big">Ngày {task.dayNumber}</span>
                        <span className="day-theme-sub">
                          {task.dayPhase.split('·')[1]?.trim() || task.moduleSlice}
                        </span>
                        <span className={`role-tag role-${task.ownerCode.toLowerCase()}`}>
                          Owner: {task.ownerCode}
                        </span>
                        <span className={`status-pill status-${task.status}`}>
                          {STATUS_META[task.status].shortLabel}
                        </span>
                        <strong className="daily-percent-badge">
                          {metrics.percent}% ({metrics.completedCount}/
                          {metrics.totalCount})
                        </strong>
                      </div>

                      {/* Col 2: Task Content & Interactive Checklist */}
                      <div className="daily-card-main">
                        <div className="daily-card-head">
                          <h3
                            className="daily-card-title"
                            onClick={() => setSelectedTaskId(task.id)}
                          >
                            {task.title}
                          </h3>
                          <div className="daily-head-badges">
                            {editPerm.allowed ? (
                              isAdminMember(activeMember) &&
                              task.ownerCode !== 'TV1' ? (
                                <span className="perm-chip perm-admin">
                                  <Crown size={11} /> Quyền Admin
                                </span>
                              ) : (
                                <span className="perm-chip perm-owner">
                                  <CheckCircle2 size={11} /> Của bạn (
                                  {task.ownerCode})
                                </span>
                              )
                            ) : (
                              <span className="perm-chip perm-locked">
                                <Lock size={11} /> Chỉ {task.ownerCode} / Admin
                              </span>
                            )}
                            <span className="badge badge-code">{task.id}</span>
                          </div>
                        </div>
                        <p className="daily-card-desc">{task.description}</p>

                        <div className="daily-checklist-wrap">
                          <div className="daily-checklist-label">
                            <strong>Checklist thực hiện trong ngày (Tick trực tiếp):</strong>
                            <span>
                              Bắt buộc: {metrics.mandatoryCompleted}/
                              {metrics.mandatoryTotal}
                            </span>
                          </div>
                          <ul className="daily-checklist-items">
                            {task.criteria.map((crit) => (
                              <li
                                key={crit.id}
                                className={crit.isCompleted ? 'done' : ''}
                              >
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={crit.isCompleted}
                                    disabled={!editPerm.allowed}
                                    onChange={() =>
                                      handleToggleCriterion(task.id, crit.id)
                                    }
                                  />
                                  <span>{crit.label}</span>
                                </label>
                                {crit.completedBy && (
                                  <small className="crit-by">
                                    ✓ {crit.completedBy}
                                  </small>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Col 3: Collaboration & Quick Fast-Forward Actions */}
                      <div className="daily-card-side">
                        <div className="daily-collab-box">
                          <div>
                            <strong>Đầu ra:</strong> {task.deliverableSummary}
                          </div>
                          <div>
                            <strong>Phối hợp / Điều kiện:</strong>{' '}
                            {task.handoverCondition}
                          </div>
                          <div>
                            <strong>Review bởi:</strong>{' '}
                            <span
                              className={`role-tag role-${task.reviewerCode.toLowerCase()}`}
                            >
                              {task.reviewerCode}
                            </span>{' '}
                            · <strong>Bàn giao:</strong>{' '}
                            {task.handoverToCodes.join(', ') || '—'}
                          </div>
                          {task.reviewerApproved && (
                            <div className="daily-approved-tag">
                              <ShieldCheck size={14} /> Reviewer{' '}
                              {task.reviewerApprovedBy} đã Approve
                            </div>
                          )}
                        </div>

                        <div className="daily-action-buttons">
                          {task.status === 'todo' && (
                            <button
                              type="button"
                              disabled={!editPerm.allowed}
                              className="btn btn-primary btn-sm"
                              onClick={() =>
                                handleChangeStatus(task.id, 'in_progress', {
                                  note: `Mở làm sớm / bắt đầu Ngày ${task.dayNumber}`,
                                })
                              }
                            >
                              <Play size={14} /> Bắt đầu làm Ngày {task.dayNumber}
                            </button>
                          )}

                          {task.status === 'in_progress' && (
                            <>
                              <button
                                type="button"
                                disabled={!editPerm.allowed}
                                className="btn btn-warning btn-sm"
                                onClick={() =>
                                  handleChangeStatus(task.id, 'review', {
                                    confirmIncompleteForReview: true,
                                  })
                                }
                              >
                                <Send size={14} /> Gửi {task.reviewerCode} Review
                              </button>
                              <button
                                type="button"
                                disabled={!editPerm.allowed}
                                className="btn btn-outline btn-sm"
                                title="Nếu lỡ bấm nhầm Bắt đầu làm, bấm vào đây để trả task về lại Todo (Chưa mở)"
                                onClick={() =>
                                  handleChangeStatus(task.id, 'todo', {
                                    note: 'Hoàn tác trạng thái từ In Progress về lại Todo (Chưa mở)',
                                  })
                                }
                              >
                                <RotateCcw size={13} /> Đặt lại về Todo
                              </button>
                            </>
                          )}

                          {task.status === 'review' && (
                            <>
                              {!task.reviewerApproved && (
                                <button
                                  type="button"
                                  disabled={!reviewPerm.allowed}
                                  className="btn btn-success btn-sm"
                                  onClick={() =>
                                    handleReviewerDecision(
                                      task.id,
                                      true,
                                      `Đã duyệt đầu ra Ngày ${task.dayNumber}`,
                                    )
                                  }
                                  title={
                                    reviewPerm.allowed
                                      ? 'Duyệt task này'
                                      : `Chuyển sang vai trò ${task.reviewerCode} để duyệt`
                                  }
                                >
                                  <CheckCircle2 size={14} /> {task.reviewerCode}{' '}
                                  Bấm Approve
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={!editPerm.allowed}
                                className="btn btn-outline btn-sm"
                                title="Thu hồi yêu cầu Review về lại trạng thái Đang làm (In Progress)"
                                onClick={() =>
                                  handleChangeStatus(task.id, 'in_progress', {
                                    note: 'Thu hồi yêu cầu Review để quay về In Progress (Đang làm)',
                                  })
                                }
                              >
                                <RotateCcw size={13} /> Về Đang làm
                              </button>
                              <button
                                type="button"
                                disabled={!editPerm.allowed}
                                className="btn btn-outline btn-sm"
                                title="Hoàn tác trạng thái về lại Todo (Chưa mở)"
                                onClick={() =>
                                  handleChangeStatus(task.id, 'todo', {
                                    note: 'Hoàn tác trạng thái từ Review về lại Todo (Chưa mở)',
                                  })
                                }
                              >
                                <RotateCcw size={13} /> Về Todo
                              </button>
                            </>
                          )}

                          {task.status === 'done' && (
                            <button
                              type="button"
                              disabled={!editPerm.allowed}
                              className="btn btn-outline btn-sm"
                              title="Mở lại task từ Done về lại trạng thái Đang làm (In Progress)"
                              onClick={() =>
                                handleChangeStatus(task.id, 'in_progress', {
                                  note: 'Mở lại task từ Done về lại In Progress (Đang làm)',
                                })
                              }
                            >
                              <RotateCcw size={13} /> Mở lại (Về Đang làm)
                            </button>
                          )}

                          {task.reviewerApproved &&
                            metrics.allMandatoryCompleted &&
                            task.status !== 'done' && (
                              <button
                                type="button"
                                disabled={!editPerm.allowed}
                                className="btn btn-success btn-sm"
                                onClick={() =>
                                  handleChangeStatus(task.id, 'done')
                                }
                              >
                                <CheckCircle2 size={14} /> Chuyển sang Done
                              </button>
                            )}

                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setSelectedTaskId(task.id)}
                          >
                            <Save size={13} /> Chi tiết / Lưu cập nhật Task
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter Toolbar (visible on Board & List tabs) */}
          {(activeTab === 'board' || activeTab === 'list') && (
            <div className="filter-toolbar" role="search">
              <div className="search-input-wrap">
                <Search size={16} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm theo mã task, tên việc, deliverable, blocker..."
                  aria-label="Tìm kiếm công việc"
                />
              </div>

              <div className="filter-selects">
                <label className="filter-item">
                  <Filter size={14} />
                  <select
                    value={filterMember}
                    onChange={(e) =>
                      setFilterMember(e.target.value as MemberCode | 'ALL')
                    }
                    aria-label="Lọc theo thành viên"
                  >
                    <option value="ALL">Tất cả thành viên (TV1–TV4)</option>
                    <option value="TV1">TV1 · Bùi Đăng Quang (Onboarding)</option>
                    <option value="TV2">TV2 · Đinh Trần Nguyên (RAG)</option>
                    <option value="TV3">TV3 · Trần Trọng Đức Tài (Service & DevOps)</option>
                    <option value="TV4">TV4 · Nguyễn Tuấn Anh (BQL Copilot & UX)</option>
                  </select>
                </label>

                {filterMember !== 'ALL' && (
                  <select
                    value={filterRelation}
                    onChange={(e) =>
                      setFilterRelation(
                        e.target.value as
                          | 'any'
                          | 'owner'
                          | 'reviewer'
                          | 'handover',
                      )
                    }
                    aria-label="Lọc theo vai trò của thành viên"
                  >
                    <option value="any">Mọi vai trò liên quan</option>
                    <option value="owner">Là Owner (Thực hiện chính)</option>
                    <option value="reviewer">Là Reviewer (Kiểm duyệt)</option>
                    <option value="handover">Là Người nhận bàn giao</option>
                  </select>
                )}

                <select
                  value={filterStatus}
                  onChange={(e) =>
                    setFilterStatus(e.target.value as TaskStatus | 'ALL')
                  }
                  aria-label="Lọc theo trạng thái"
                >
                  <option value="ALL">Mọi trạng thái</option>
                  <option value="todo">Todo</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Review</option>
                  <option value="done">Done</option>
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) =>
                    setFilterPriority(e.target.value as TaskPriority | 'ALL')
                  }
                  aria-label="Lọc theo độ ưu tiên"
                >
                  <option value="ALL">Mọi mức ưu tiên</option>
                  <option value="P0">Ưu tiên P0</option>
                  <option value="P1">Ưu tiên P1</option>
                  <option value="P2">Ưu tiên P2</option>
                </select>

                <select
                  value={filterSlice}
                  onChange={(e) =>
                    setFilterSlice(e.target.value as ModuleSlice | 'ALL')
                  }
                  aria-label="Lọc theo module"
                >
                  <option value="ALL">Tất cả 4 Modules</option>
                  <option value="Onboarding">Onboarding</option>
                  <option value="RAG">RAG Knowledge</option>
                  <option value="Service & DevOps">Service & DevOps</option>
                  <option value="BQL Copilot & UX">BQL Copilot & UX</option>
                </select>

                <label className="checkbox-filter">
                  <input
                    type="checkbox"
                    checked={onlyBlockedOrOverdue}
                    onChange={(e) => setOnlyBlockedOrOverdue(e.target.checked)}
                  />
                  <span>Chỉ Blocker / Quá hạn</span>
                </label>
              </div>
            </div>
          )}

          {/* TAB 1: KANBAN BOARD */}
          {activeTab === 'board' && (
            <>
              {filteredTasks.length === 0 ? (
                <div className="empty-state-box">
                  <p>
                    Không có công việc nào khớp với bộ lọc hiện tại. Hãy thử xoá
                    bộ lọc hoặc tạo task mới.
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setFilterMember('ALL');
                      setFilterStatus('ALL');
                      setFilterPriority('ALL');
                      setFilterSlice('ALL');
                      setOnlyBlockedOrOverdue(false);
                      setSearchQuery('');
                    }}
                  >
                    Xoá bộ lọc
                  </button>
                </div>
              ) : (
                <div className="kanban-grid">
                  {ALL_STATUSES.map((statusKey) => {
                    const columnTasks = filteredTasks.filter(
                      (t) => t.status === statusKey,
                    );
                    return (
                      <div
                        key={statusKey}
                        className={`kanban-column col-${statusKey}`}
                      >
                        <div className="kanban-col-header">
                          <span className="col-title">
                            {STATUS_META[statusKey].label}
                          </span>
                          <span className="col-count">
                            {columnTasks.length}
                          </span>
                        </div>

                        <div className="kanban-cards">
                          {columnTasks.length === 0 ? (
                            <div className="kanban-empty">
                              Trống trong cột này
                            </div>
                          ) : (
                            columnTasks.map((task) => {
                              const metrics = calculateTaskProgress(task);
                              const overdue = isTaskOverdue(task);
                              const hasBlocker =
                                task.isBlocked ||
                                task.blocker.trim().length > 0;

                              return (
                                <article
                                  key={task.id}
                                  className={`task-card ${
                                    hasBlocker ? 'card-blocked' : ''
                                  }`}
                                >
                                  <div className="task-card-top">
                                    <span className="badge badge-code">
                                      {task.id}
                                    </span>
                                    <span
                                      className={`badge badge-priority-${task.priority.toLowerCase()}`}
                                    >
                                      {task.priority}
                                    </span>
                                    <span className="badge badge-slice">
                                      {task.moduleSlice}
                                    </span>
                                    {overdue && (
                                      <span className="badge badge-danger">
                                        Quá hạn
                                      </span>
                                    )}
                                  </div>

                                  <h3
                                    className="task-card-title"
                                    onClick={() => setSelectedTaskId(task.id)}
                                  >
                                    {task.title}
                                  </h3>

                                  <p className="task-card-desc">
                                    {task.description}
                                  </p>

                                  {hasBlocker && (
                                    <div className="card-blocker-alert">
                                      <AlertTriangle size={14} />
                                      <span>
                                        <strong>Blocker:</strong> {task.blocker}
                                      </span>
                                    </div>
                                  )}

                                  {/* Roles: Owner, Reviewer, Handover */}
                                  <div className="task-role-grid">
                                    <div>
                                      <small>Owner</small>
                                      <strong
                                        className={`role-tag role-${task.ownerCode.toLowerCase()}`}
                                      >
                                        {task.ownerCode}
                                      </strong>
                                    </div>
                                    <div>
                                      <small>Reviewer</small>
                                      <strong
                                        className={`role-tag role-${task.reviewerCode.toLowerCase()}`}
                                      >
                                        {task.reviewerCode}
                                      </strong>
                                    </div>
                                    <div>
                                      <small>Bàn giao</small>
                                      <strong className="handover-targets">
                                        {task.handoverToCodes.join(', ') ||
                                          '—'}
                                      </strong>
                                    </div>
                                  </div>

                                  {/* Checklist Progress */}
                                  <div className="card-checklist-box">
                                    <div className="card-checklist-head">
                                      <span>
                                        Checklist: {metrics.completedCount}/
                                        {metrics.totalCount} (Bắt buộc:{' '}
                                        {metrics.mandatoryCompleted}/
                                        {metrics.mandatoryTotal})
                                      </span>
                                      <strong>{metrics.percent}%</strong>
                                    </div>
                                    <div className="mini-progress-track">
                                      <div
                                        className="mini-progress-fill"
                                        style={{ width: `${metrics.percent}%` }}
                                      />
                                    </div>
                                  </div>

                                  {/* Reviewer Sign-off Badge */}
                                  <div className="card-footer-row">
                                    {task.reviewerApproved ? (
                                      <span className="reviewer-chip approved">
                                        <ShieldCheck size={13} />{' '}
                                        {task.reviewerApprovedBy} đã Approve
                                      </span>
                                    ) : (
                                      <span className="reviewer-chip pending">
                                        <UserCheck size={13} /> Chờ{' '}
                                        {task.reviewerCode} duyệt
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      className="btn btn-outline btn-xs"
                                      onClick={() => setSelectedTaskId(task.id)}
                                    >
                                      Chi tiết & Checklist
                                    </button>
                                  </div>
                                </article>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* TAB 2: LIST & 7-DAY TIMELINE VIEW */}
          {activeTab === 'list' && (
            <div className="table-card">
              <div className="table-responsive">
                <table className="tracker-table">
                  <thead>
                    <tr>
                      <th>Mã & Ngày</th>
                      <th>Công việc & Đầu ra bắt buộc</th>
                      <th>Owner</th>
                      <th>Reviewer</th>
                      <th>Bàn giao cho</th>
                      <th>Checklist</th>
                      <th>Trạng thái & Gate</th>
                      <th>Hạn chót</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((task) => {
                      const metrics = calculateTaskProgress(task);
                      const overdue = isTaskOverdue(task);
                      return (
                        <tr key={task.id}>
                          <td>
                            <strong>{task.id}</strong>
                            <small className="block-muted">
                              {task.dayPhase}
                            </small>
                            <span
                              className={`badge badge-priority-${task.priority.toLowerCase()}`}
                            >
                              {task.priority}
                            </span>
                          </td>
                          <td>
                            <div className="table-task-title">{task.title}</div>
                            <small className="block-muted">
                              Đầu ra: {task.deliverableSummary}
                            </small>
                            {(task.isBlocked ||
                              task.blocker.trim().length > 0) && (
                              <div className="inline-blocker-text">
                                ⚠ Blocker: {task.blocker}
                              </div>
                            )}
                          </td>
                          <td>
                            <span
                              className={`role-tag role-${task.ownerCode.toLowerCase()}`}
                            >
                              {task.ownerCode}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`role-tag role-${task.reviewerCode.toLowerCase()}`}
                            >
                              {task.reviewerCode}
                            </span>
                          </td>
                          <td>
                            <span className="handover-list-tag">
                              <Send size={12} />{' '}
                              {task.handoverToCodes.join(', ')}
                            </span>
                          </td>
                          <td>
                            <strong>{metrics.percent}%</strong>
                            <small className="block-muted">
                              {metrics.completedCount}/{metrics.totalCount} tiêu
                              chí
                            </small>
                          </td>
                          <td>
                            <span
                              className={`status-pill status-${task.status}`}
                            >
                              {STATUS_META[task.status].shortLabel}
                            </span>
                            <small className="block-muted">
                              {task.reviewerApproved
                                ? `✓ Approved (${task.reviewerApprovedBy})`
                                : `Chờ ${task.reviewerCode} duyệt`}
                            </small>
                          </td>
                          <td>
                            <span className={overdue ? 'text-danger' : ''}>
                              {new Date(task.deadline).toLocaleDateString(
                                'vi-VN',
                              )}
                            </span>
                            {overdue && (
                              <small className="block-danger">Quá hạn</small>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              onClick={() => setSelectedTaskId(task.id)}
                            >
                              Mở Checklist
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: COLLABORATION HANDOVERS & QUALITY GATES */}
          {activeTab === 'handover' && (
            <div className="handover-tab-grid">
              <div className="table-card">
                <div className="card-section-head">
                  <h3>
                    Điểm giao nhau & Bàn giao giữa 4 Thành viên (Collaboration
                    Map)
                  </h3>
                  <p className="muted-text">
                    Theo chuẩn MoveInMate VHR-16: Thống nhất contract ở Ngày 1,
                    phát triển song song bằng mock JSON và nghiệm thu khi đủ
                    điều kiện chuyển giao.
                  </p>
                </div>
                <div className="table-responsive">
                  <table className="tracker-table">
                    <thead>
                      <tr>
                        <th>Mã</th>
                        <th>Công đoạn bàn giao</th>
                        <th>Từ → Nhận (Reviewer)</th>
                        <th>Đầu vào & Điều kiện chuyển giao</th>
                        <th>Trạng thái Bàn giao</th>
                        <th>Cập nhật</th>
                      </tr>
                    </thead>
                    <tbody>
                      {handovers.map((ho) => (
                        <tr key={ho.id}>
                          <td>
                            <strong>{ho.id}</strong>
                            <small className="block-muted">{ho.taskId}</small>
                          </td>
                          <td>
                            <strong>{ho.stageName}</strong>
                            <small className="block-muted">{ho.notes}</small>
                          </td>
                          <td>
                            <span
                              className={`role-tag role-${ho.fromMemberCode.toLowerCase()}`}
                            >
                              {ho.fromMemberCode}
                            </span>{' '}
                            →{' '}
                            <span
                              className={`role-tag role-${ho.toMemberCode.toLowerCase()}`}
                            >
                              {ho.toMemberCode}
                            </span>
                            <small className="block-muted">
                              Review bởi: {ho.reviewerCode}
                            </small>
                          </td>
                          <td>
                            <div>
                              <strong>Cần:</strong> {ho.inputRequired}
                            </div>
                            <div>
                              <strong>Điều kiện:</strong> {ho.conditionText}
                            </div>
                          </td>
                          <td>
                            <span className={`ho-pill ho-${ho.status}`}>
                              {ho.status}
                            </span>
                          </td>
                          <td>
                            <select
                              value={ho.status}
                              disabled={!activeMember}
                              onChange={(e) =>
                                handleUpdateHandoverStatus(
                                  ho.id,
                                  e.target.value as HandoverStatus,
                                )
                              }
                              aria-label={`Trạng thái bàn giao ${ho.id}`}
                            >
                              <option value="pending">Pending (Đang làm)</option>
                              <option value="ready">
                                Ready (Sẵn sàng giao)
                              </option>
                              <option value="accepted">
                                Accepted (Đã nghiệm thu)
                              </option>
                              <option value="changes_requested">
                                Changes Requested
                              </option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Quality Gates & Rubric */}
              <div className="quality-gates-grid">
                <div className="info-box">
                  <h3>
                    <CheckCircle2 size={17} /> Ngưỡng Nghiệm thu MVP (Quality
                    Gates)
                  </h3>
                  <ul className="gate-bullet-list">
                    <li>
                      <strong>RAG (TV2):</strong> Hit@3 ≥ 80% trên bộ 25 câu hỏi
                      Golden Set và citation đúng tài liệu.
                    </li>
                    <li>
                      <strong>Onboarding Checklist (TV1):</strong> ≥ 90%
                      expected items trên bộ hồ sơ cư dân synthetic.
                    </li>
                    <li>
                      <strong>Service Routing (TV3):</strong> macro-F1 hoặc
                      accuracy ≥ 80% + deterministic rule kiểm tra phí/khẩn cấp.
                    </li>
                    <li>
                      <strong>BQL HITL (TV4):</strong> 100% quyết định nhạy cảm
                      yêu cầu người thật xác nhận và ghi Audit Log.
                    </li>
                    <li>
                      <strong>Bảo mật & RLS (TV3):</strong> 0 trường hợp rò rỉ
                      dữ liệu cross-tenant / cross-workspace.
                    </li>
                  </ul>
                </div>

                <div className="info-box">
                  <h3>
                    <Bot size={17} /> Nguyên tắc Minh bạch AI & Phân quyền RLS
                  </h3>
                  <ul className="gate-bullet-list">
                    <li>
                      <strong>AI Copilot:</strong> Chỉ tóm tắt tình trạng và gợi
                      ý bước tiếp theo kèm mức <code>Confidence</code>; không tự
                      động chuyển task sang Done.
                    </li>
                    <li>
                      <strong>Cổng Done kép:</strong> Cả ở tầng giao diện lẫn
                      trigger PostgreSQL{' '}
                      <code>enforce_task_workflow_gate()</code> đều chặn{' '}
                      <code>status = 'done'</code> nếu thiếu tiêu chí bắt buộc
                      hoặc chưa có xác nhận của Reviewer.
                    </li>
                    <li>
                      <strong>Cách ly Workspace:</strong> Chính sách RLS kiểm
                      tra <code>public.is_workspace_member(workspace_id)</code>{' '}
                      trên toàn bộ bảng dữ liệu.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: AUDIT TRAIL & RECENT ACTIVITY */}
          {activeTab === 'audit' && (
            <div className="table-card">
              <div className="card-section-head">
                <h3>
                  <Activity size={18} /> Nhật ký Thay đổi & Audit Log Toàn Dự án
                </h3>
                <p className="muted-text">
                  Lưu vết đầy đủ ai đã thay đổi trạng thái, tick tiêu chí đầu
                  ra, cập nhật blocker hoặc phê duyệt review và vào thời điểm
                  nào.
                </p>
              </div>
              <ul className="full-audit-list">
                {auditLogs.length === 0 ? (
                  <li className="full-audit-item">
                    <div className="audit-content-col">
                      <p className="muted-text">
                        Chưa có thao tác nào được ghi nhận. Khi 4 thành viên bắt
                        đầu tick checklist, đổi trạng thái hoặc duyệt Review,
                        lịch sử sẽ tự động hiển thị tại đây theo thời gian thực.
                      </p>
                    </div>
                  </li>
                ) : (
                  auditLogs.map((log) => (
                    <li key={log.id} className="full-audit-item">
                      <div className="audit-badge-col">
                        <span
                          className={`role-tag role-${String(
                            log.actorCode,
                          ).toLowerCase()}`}
                        >
                          {log.actorCode}
                        </span>
                      </div>
                      <div className="audit-content-col">
                        <div className="audit-top-line">
                          <strong>{log.actorName}</strong>
                          {log.taskId && (
                            <button
                              type="button"
                              className="audit-task-link"
                              onClick={() => setSelectedTaskId(log.taskId)}
                            >
                              {log.taskId}
                            </button>
                          )}
                          <span className="audit-time">
                            {new Date(log.createdAt).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <p>{log.summary}</p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}

          {/* TAB 5: IN-APP DETAILED USER GUIDE */}
          {activeTab === 'guide' && (
            <UserGuideView
              members={members}
              onJumpToMemberRoadmap={(code) => {
                setFilterMember(code);
                setFilterRelation('owner');
                setFilterDay('ALL');
                setActiveTab('daily');
                showToast(
                  `Đang xem Lộ trình 7 Ngày của ${getMemberName(code)}`,
                  'info',
                );
              }}
              onOpenAuthModal={() => setIsSetupModalOpen(true)}
            />
          )}
        </section>
      </main>

      <footer className="app-footer">
        <div className="container footer-inner">
          <span>
            MoveInMate AI · Team Progress & Handover Tracker (VHR-16) · Đồng bộ
            thời gian thực với Supabase Auth, PostgreSQL, Realtime & RLS.
          </span>
          <span>
            <Sparkles size={13} /> Dữ liệu thực tế cho 4 thành viên dự án
            MoveInMate VHR-16 — Bảo mật bằng Supabase RLS.
          </span>
        </div>
      </footer>

      {/* Modals */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          allTasks={tasks}
          members={members}
          auditLogs={auditLogs}
          activeMember={activeMember}
          onClose={() => setSelectedTaskId(null)}
          onAddCriterion={handleAddCriterion}
          onReviewerDecision={handleReviewerDecision}
          onSaveTaskDetail={handleSaveTaskDetail}
        />
      )}

      {isNewTaskModalOpen && (
        <NewTaskModal
          members={members}
          defaultOwner={activeMember ?? 'TV1'}
          onClose={() => setIsNewTaskModalOpen(false)}
          onCreateTask={handleCreateTask}
        />
      )}

      {isSetupModalOpen && (
        <SupabaseSetupModal
          envConfig={envConfig}
          members={members}
          currentMember={activeMember}
          authEmail={authEmail}
          onClose={() => setIsSetupModalOpen(false)}
          onSupabaseSignIn={handleSupabaseSignIn}
          onSupabaseSignOut={handleSupabaseSignOut}
        />
      )}
    </div>
  );
}
export default App;
