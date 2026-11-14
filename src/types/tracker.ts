export type MemberCode = 'TV1' | 'TV2' | 'TV3' | 'TV4';

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';

export type TaskPriority = 'P0' | 'P1' | 'P2';

export type ModuleSlice =
  | 'Onboarding'
  | 'RAG'
  | 'Service & DevOps'
  | 'BQL Copilot & UX';

export type CriterionCategory =
  | 'functional'
  | 'ai_quality'
  | 'security'
  | 'handover'
  | 'testing';

export type AIConfidence = 'high' | 'medium' | 'low';

export type HandoverStatus =
  | 'pending'
  | 'ready'
  | 'accepted'
  | 'changes_requested';

export type AuditActionType =
  | 'status_changed'
  | 'criteria_toggled'
  | 'reviewer_decision'
  | 'blocker_updated'
  | 'task_updated'
  | 'handover_updated'
  | 'comment_added';

export interface TeamMember {
  id: string;
  workspaceId: string;
  memberCode: MemberCode;
  displayName: string;
  email: string;
  sliceName: string;
  crossRole: string;
  colorHex: string;
  avatarLabel: string;
  isLead: boolean;
  finalDeliverables: string[];
}

export interface TaskCriterion {
  id: string;
  taskId: string;
  label: string;
  category: CriterionCategory;
  isMandatory: boolean;
  isCompleted: boolean;
  completedBy?: MemberCode | null;
  completedAt?: string | null;
  sortOrder: number;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  dependencyType: 'contract' | 'schema' | 'api' | 'review' | 'release';
  note: string;
}

export interface TrackerTask {
  id: string;
  workspaceId: string;
  dayNumber: number;
  dayPhase: string;
  moduleSlice: ModuleSlice;
  title: string;
  description: string;
  deliverableSummary: string;
  ownerCode: MemberCode;
  reviewerCode: MemberCode;
  supporterCodes: MemberCode[];
  handoverToCodes: MemberCode[];
  handoverCondition: string;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: string;
  blocker: string;
  isBlocked: boolean;
  reviewerApproved: boolean;
  reviewerApprovedBy?: MemberCode | null;
  reviewerApprovedAt?: string | null;
  reviewerNote: string;
  aiSuggestion: string;
  aiConfidence: AIConfidence;
  evidenceLinks: string[];
  notes: string;
  criteria: TaskCriterion[];
  dependencies: TaskDependency[];
  updatedAt: string;
}

export interface HandoverItem {
  id: string;
  workspaceId: string;
  taskId: string;
  fromMemberCode: MemberCode;
  toMemberCode: MemberCode;
  reviewerCode: MemberCode;
  stageName: string;
  inputRequired: string;
  conditionText: string;
  status: HandoverStatus;
  notes: string;
  updatedAt: string;
}

export interface AuditLogItem {
  id: string;
  workspaceId: string;
  taskId: string | null;
  actorCode: MemberCode | 'SYSTEM';
  actorName: string;
  actionType: AuditActionType;
  summary: string;
  createdAt: string;
}

export interface TaskProgressMetrics {
  totalCount: number;
  completedCount: number;
  mandatoryTotal: number;
  mandatoryCompleted: number;
  incompleteMandatoryCount: number;
  percent: number;
  allMandatoryCompleted: boolean;
}

export interface MemberProgressSummary {
  memberCode: MemberCode;
  totalTasks: number;
  todoTasks: number;
  inProgressTasks: number;
  reviewTasks: number;
  doneTasks: number;
  blockedTasks: number;
  overdueTasks: number;
  totalCriteria: number;
  completedCriteria: number;
  completionPercent: number;
  reviewQueueCount: number;
}

export interface ProjectProgressSummary {
  totalTasks: number;
  todoCount: number;
  inProgressCount: number;
  reviewCount: number;
  doneCount: number;
  blockedCount: number;
  overdueCount: number;
  totalCriteria: number;
  completedCriteria: number;
  overallPercent: number;
  memberSummaries: Record<MemberCode, MemberProgressSummary>;
}

export interface TransitionValidationResult {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason?: string;
}

export interface PermissionValidationResult {
  allowed: boolean;
  reason?: string;
}

