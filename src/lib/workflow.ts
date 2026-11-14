import type {
  MemberCode,
  MemberProgressSummary,
  PermissionValidationResult,
  ProjectProgressSummary,
  TaskProgressMetrics,
  TaskStatus,
  TrackerTask,
  TransitionValidationResult,
} from '../types/tracker';

const ALL_MEMBERS: MemberCode[] = ['TV1', 'TV2', 'TV3', 'TV4'];

export function calculateTaskProgress(task: TrackerTask): TaskProgressMetrics {
  const criteria = task.criteria ?? [];
  const totalCount = criteria.length;
  const completedCount = criteria.filter((c) => c.isCompleted).length;
  const mandatoryItems = criteria.filter((c) => c.isMandatory);
  const mandatoryTotal = mandatoryItems.length;
  const mandatoryCompleted = mandatoryItems.filter((c) => c.isCompleted).length;
  const incompleteMandatoryCount = mandatoryTotal - mandatoryCompleted;
  const allMandatoryCompleted = incompleteMandatoryCount === 0;

  let percent = 0;
  if (totalCount > 0) {
    percent = Math.round((completedCount / totalCount) * 100);
  } else if (task.status === 'done') {
    percent = 100;
  }

  return {
    totalCount,
    completedCount,
    mandatoryTotal,
    mandatoryCompleted,
    incompleteMandatoryCount,
    percent,
    allMandatoryCompleted,
  };
}

export function isTaskOverdue(
  task: TrackerTask,
  referenceDate: Date = new Date(),
): boolean {
  if (task.status === 'done') {
    return false;
  }
  const deadlineTime = new Date(task.deadline).getTime();
  if (Number.isNaN(deadlineTime)) {
    return false;
  }
  return deadlineTime < referenceDate.getTime();
}

export function calculateMemberProgress(
  tasks: TrackerTask[],
  memberCode: MemberCode,
  referenceDate: Date = new Date(),
): MemberProgressSummary {
  const ownedTasks = tasks.filter((t) => t.ownerCode === memberCode);
  const reviewQueueCount = tasks.filter(
    (t) =>
      t.reviewerCode === memberCode &&
      t.status === 'review' &&
      !t.reviewerApproved,
  ).length;

  let totalCriteria = 0;
  let completedCriteria = 0;
  let weightedSum = 0;

  for (const task of ownedTasks) {
    const metrics = calculateTaskProgress(task);
    totalCriteria += metrics.totalCount;
    completedCriteria += metrics.completedCount;
    weightedSum += metrics.percent;
  }

  const completionPercent =
    ownedTasks.length > 0 ? Math.round(weightedSum / ownedTasks.length) : 0;

  return {
    memberCode,
    totalTasks: ownedTasks.length,
    todoTasks: ownedTasks.filter((t) => t.status === 'todo').length,
    inProgressTasks: ownedTasks.filter((t) => t.status === 'in_progress')
      .length,
    reviewTasks: ownedTasks.filter((t) => t.status === 'review').length,
    doneTasks: ownedTasks.filter((t) => t.status === 'done').length,
    blockedTasks: ownedTasks.filter(
      (t) => t.isBlocked || t.blocker.trim().length > 0,
    ).length,
    overdueTasks: ownedTasks.filter((t) => isTaskOverdue(t, referenceDate))
      .length,
    totalCriteria,
    completedCriteria,
    completionPercent,
    reviewQueueCount,
  };
}

export function calculateProjectSummary(
  tasks: TrackerTask[],
  referenceDate: Date = new Date(),
): ProjectProgressSummary {
  const memberSummaries = {} as Record<MemberCode, MemberProgressSummary>;
  for (const code of ALL_MEMBERS) {
    memberSummaries[code] = calculateMemberProgress(tasks, code, referenceDate);
  }

  let totalCriteria = 0;
  let completedCriteria = 0;
  let weightedSum = 0;

  for (const task of tasks) {
    const metrics = calculateTaskProgress(task);
    totalCriteria += metrics.totalCount;
    completedCriteria += metrics.completedCount;
    weightedSum += metrics.percent;
  }

  const overallPercent =
    tasks.length > 0 ? Math.round(weightedSum / tasks.length) : 0;

  return {
    totalTasks: tasks.length,
    todoCount: tasks.filter((t) => t.status === 'todo').length,
    inProgressCount: tasks.filter((t) => t.status === 'in_progress').length,
    reviewCount: tasks.filter((t) => t.status === 'review').length,
    doneCount: tasks.filter((t) => t.status === 'done').length,
    blockedCount: tasks.filter(
      (t) => t.isBlocked || t.blocker.trim().length > 0,
    ).length,
    overdueCount: tasks.filter((t) => isTaskOverdue(t, referenceDate)).length,
    totalCriteria,
    completedCriteria,
    overallPercent,
    memberSummaries,
  };
}

export function isAdminMember(actorCode: MemberCode | null): boolean {
  return actorCode === 'TV1';
}

export function canMemberPerformAction(
  task: TrackerTask,
  actorCode: MemberCode | null,
  action:
    | 'edit_task'
    | 'toggle_criterion'
    | 'change_status'
    | 'approve_review'
    | 'request_changes',
  actorWorkspaceId?: string,
): PermissionValidationResult {
  if (!actorCode) {
    return {
      allowed: false,
      reason:
        'Bạn đang ở Chế độ Xem (Chưa đăng nhập). Vui lòng đăng nhập tài khoản thành viên để tương tác.',
    };
  }

  if (actorWorkspaceId && actorWorkspaceId !== task.workspaceId) {
    return {
      allowed: false,
      reason:
        'Vi phạm RLS Cross-Workspace: Bạn không có quyền truy cập hoặc chỉnh sửa dữ liệu của workspace khác.',
    };
  }

  // Admin (TV1 · Bùi Đăng Quang) has full permission across all tasks and reviews
  if (isAdminMember(actorCode)) {
    return { allowed: true };
  }

  if (action === 'approve_review' || action === 'request_changes') {
    if (actorCode !== task.reviewerCode) {
      return {
        allowed: false,
        reason: `Chỉ Reviewer được phân công (${task.reviewerCode}) hoặc Admin (TV1) mới có quyền xác nhận duyệt hoặc yêu cầu chỉnh sửa task ${task.id}.`,
      };
    }
    return { allowed: true };
  }

  // Strict Owner-only interaction for checklist, status, and task editing (unless Admin TV1)
  if (actorCode !== task.ownerCode) {
    return {
      allowed: false,
      reason: `Phân quyền: Tài khoản ${actorCode} chỉ được xem task này. Chỉ Owner (${task.ownerCode}) hoặc Admin (TV1) mới được phép tương tác.`,
    };
  }

  return { allowed: true };
}

export function validateStatusTransition(
  task: TrackerTask,
  nextStatus: TaskStatus,
  actorCode: MemberCode | null,
  options?: { confirmIncompleteForReview?: boolean; actorWorkspaceId?: string },
): TransitionValidationResult {
  const permission = canMemberPerformAction(
    task,
    actorCode,
    'change_status',
    options?.actorWorkspaceId,
  );
  if (!permission.allowed) {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: permission.reason,
    };
  }

  const metrics = calculateTaskProgress(task);

  if (nextStatus === 'review') {
    if (!metrics.allMandatoryCompleted && !options?.confirmIncompleteForReview) {
      return {
        allowed: false,
        requiresConfirmation: true,
        reason: `Task còn ${metrics.incompleteMandatoryCount}/${metrics.mandatoryTotal} tiêu chí bắt buộc chưa hoàn thành. Vui lòng hoàn thành đủ hoặc xác nhận gửi Review sớm kèm ghi chú.`,
      };
    }
  }

  if (nextStatus === 'done') {
    if (!metrics.allMandatoryCompleted) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Không thể chuyển sang Done: Còn ${metrics.incompleteMandatoryCount} tiêu chí đầu ra bắt buộc chưa được tick hoàn thành.`,
      };
    }

    if (!task.reviewerApproved) {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: `Không thể chuyển sang Done: Reviewer (${task.reviewerCode}) chưa xác nhận phê duyệt (Approve) đầu ra của task này.`,
      };
    }
  }

  return {
    allowed: true,
    requiresConfirmation: false,
  };
}

