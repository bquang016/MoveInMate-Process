import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  FileCheck2,
  GitBranch,
  History,
  Lock,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  X,
} from 'lucide-react';
import {
  calculateTaskProgress,
  canMemberPerformAction,
  isTaskOverdue,
  validateStatusTransition,
} from '../lib/workflow';
import type {
  AuditLogItem,
  CriterionCategory,
  MemberCode,
  TaskCriterion,
  TaskPriority,
  TaskStatus,
  TeamMember,
  TrackerTask,
} from '../types/tracker';

interface TaskDetailModalProps {
  task: TrackerTask;
  allTasks: TrackerTask[];
  members: TeamMember[];
  auditLogs: AuditLogItem[];
  activeMember: MemberCode | null;
  onClose: () => void;
  onAddCriterion: (
    taskId: string,
    label: string,
    category: CriterionCategory,
    isMandatory: boolean,
  ) => void;
  onReviewerDecision: (
    taskId: string,
    approved: boolean,
    note: string,
  ) => { ok: boolean; message?: string };
  onSaveTaskDetail: (
    taskId: string,
    payload: {
      status: TaskStatus;
      criteria: TaskCriterion[];
      ownerCode: MemberCode;
      reviewerCode: MemberCode;
      priority: TaskPriority;
      deadline: string;
      handoverToCodes: MemberCode[];
      blocker: string;
      isBlocked: boolean;
      notes: string;
      confirmIncompleteForReview?: boolean;
    },
  ) => { ok: boolean; message?: string };
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Todo (Chưa mở)',
  in_progress: 'In Progress (Đang làm)',
  review: 'Review (Chờ duyệt)',
  done: 'Done (Hoàn tất)',
};

const CATEGORY_LABELS: Record<CriterionCategory, string> = {
  functional: 'Nghiệp vụ / API',
  ai_quality: 'Chất lượng AI',
  security: 'Bảo mật / RLS',
  handover: 'Bàn giao',
  testing: 'Kiểm thử',
};

const ALL_MEMBERS: MemberCode[] = ['TV1', 'TV2', 'TV3', 'TV4'];

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  allTasks,
  members,
  auditLogs,
  activeMember,
  onClose,
  onAddCriterion,
  onReviewerDecision,
  onSaveTaskDetail,
}) => {
  // Draft state inside modal — Only saved & sent to Discord when user clicks "Lưu cập nhật Task"
  const [draftStatus, setDraftStatus] = useState<TaskStatus>(task.status);
  const [draftCriteria, setDraftCriteria] = useState<TaskCriterion[]>(
    task.criteria,
  );
  const [confirmedEarlyReview, setConfirmedEarlyReview] = useState(false);

  const [reviewNoteInput, setReviewNoteInput] = useState(
    task.reviewerNote || '',
  );
  const [blockerInput, setBlockerInput] = useState(task.blocker || '');
  const [notesInput, setNotesInput] = useState(task.notes || '');
  const [ownerInput, setOwnerInput] = useState<MemberCode>(task.ownerCode);
  const [reviewerInput, setReviewerInput] = useState<MemberCode>(
    task.reviewerCode,
  );
  const [priorityInput, setPriorityInput] = useState<TaskPriority>(
    task.priority,
  );
  const [deadlineInput, setDeadlineInput] = useState(
    task.deadline.slice(0, 10),
  );
  const [handoverToInput, setHandoverToInput] = useState<MemberCode[]>(
    task.handoverToCodes,
  );

  const [newCriterionLabel, setNewCriterionLabel] = useState('');
  const [newCriterionCategory, setNewCriterionCategory] =
    useState<CriterionCategory>('functional');
  const [newCriterionMandatory, setNewCriterionMandatory] = useState(true);

  const [pendingReviewConfirm, setPendingReviewConfirm] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'error' | 'success' | 'warning' | 'info';
    text: string;
  } | null>(null);

  const draftTask: TrackerTask = useMemo(
    () => ({
      ...task,
      status: draftStatus,
      criteria: draftCriteria,
      ownerCode: ownerInput,
      reviewerCode: reviewerInput,
      priority: priorityInput,
      deadline: deadlineInput ? `${deadlineInput}T17:00:00Z` : task.deadline,
      handoverToCodes: handoverToInput,
      blocker: blockerInput.trim(),
      isBlocked: blockerInput.trim().length > 0,
      notes: notesInput.trim(),
    }),
    [
      task,
      draftStatus,
      draftCriteria,
      ownerInput,
      reviewerInput,
      priorityInput,
      deadlineInput,
      handoverToInput,
      blockerInput,
      notesInput,
    ],
  );

  const progress = calculateTaskProgress(draftTask);
  const overdue = isTaskOverdue(draftTask);
  const editPerm = canMemberPerformAction(task, activeMember, 'edit_task');
  const reviewPerm = canMemberPerformAction(
    task,
    activeMember,
    'approve_review',
  );

  const hasUnsavedChanges = useMemo(() => {
    if (draftStatus !== task.status) return true;
    if (ownerInput !== task.ownerCode) return true;
    if (reviewerInput !== task.reviewerCode) return true;
    if (priorityInput !== task.priority) return true;
    if (deadlineInput !== task.deadline.slice(0, 10)) return true;
    if (blockerInput.trim() !== task.blocker.trim()) return true;
    if (notesInput.trim() !== task.notes.trim()) return true;
    if (
      handoverToInput.join(',') !== task.handoverToCodes.join(',')
    ) {
      return true;
    }
    if (draftCriteria.length !== task.criteria.length) return true;
    for (let i = 0; i < draftCriteria.length; i += 1) {
      if (draftCriteria[i].isCompleted !== task.criteria[i]?.isCompleted) {
        return true;
      }
    }
    return false;
  }, [
    draftStatus,
    task,
    ownerInput,
    reviewerInput,
    priorityInput,
    deadlineInput,
    blockerInput,
    notesInput,
    handoverToInput,
    draftCriteria,
  ]);

  const taskAuditLogs = auditLogs.filter((log) => log.taskId === task.id);

  // Draft toggle criterion inside modal (does NOT save or notify Discord until user clicks Lưu)
  const handleDraftToggleCriterion = (criterionId: string) => {
    if (!editPerm.allowed) return;
    setFeedbackMessage(null);
    const nowIso = new Date().toISOString();

    setDraftCriteria((prev) => {
      const target = prev.find((c) => c.id === criterionId);
      if (!target) return prev;
      const nextCompleted = !target.isCompleted;
      const updated = prev.map((c) =>
        c.id === criterionId
          ? {
              ...c,
              isCompleted: nextCompleted,
              completedBy: nextCompleted ? activeMember : null,
              completedAt: nextCompleted ? nowIso : null,
            }
          : c,
      );

      const allUnchecked = updated.every((c) => !c.isCompleted);
      if (draftStatus === 'done' && !nextCompleted && target.isMandatory) {
        setDraftStatus('review');
      } else if (draftStatus === 'todo' && nextCompleted) {
        setDraftStatus('in_progress');
      } else if (draftStatus === 'in_progress' && !nextCompleted && allUnchecked) {
        setDraftStatus('todo');
      }

      return updated;
    });
  };

  // Draft status selection inside modal (does NOT save or notify Discord until user clicks Lưu)
  const handleStatusButtonClick = (targetStatus: TaskStatus) => {
    setFeedbackMessage(null);
    const check = validateStatusTransition(
      draftTask,
      targetStatus,
      activeMember,
    );
    if (!check.allowed && check.requiresConfirmation) {
      setPendingReviewConfirm(true);
      setFeedbackMessage({
        type: 'warning',
        text:
          check.reason ||
          'Còn tiêu chí bắt buộc chưa hoàn thành. Xác nhận chọn trạng thái Review sớm?',
      });
      return;
    }

    if (!check.allowed) {
      setFeedbackMessage({
        type: 'error',
        text: check.reason || 'Không đủ điều kiện chuyển sang trạng thái này.',
      });
      return;
    }

    setPendingReviewConfirm(false);
    setDraftStatus(targetStatus);
    setFeedbackMessage({
      type: 'info',
      text: `Đã chọn trạng thái "${STATUS_LABELS[targetStatus]}" (Bản nháp). Hãy bấm "Lưu cập nhật Task" để lưu và gửi thông báo Discord.`,
    });
  };

  const handleConfirmEarlyReview = () => {
    setPendingReviewConfirm(false);
    setConfirmedEarlyReview(true);
    setDraftStatus('review');
    setFeedbackMessage({
      type: 'info',
      text: 'Đã chọn trạng thái Review sớm (Bản nháp). Hãy bấm "Lưu cập nhật Task" để lưu và gửi thông báo Discord.',
    });
  };

  const handleResetDraft = () => {
    setDraftStatus(task.status);
    setDraftCriteria(task.criteria);
    setOwnerInput(task.ownerCode);
    setReviewerInput(task.reviewerCode);
    setPriorityInput(task.priority);
    setDeadlineInput(task.deadline.slice(0, 10));
    setHandoverToInput(task.handoverToCodes);
    setBlockerInput(task.blocker || '');
    setNotesInput(task.notes || '');
    setPendingReviewConfirm(false);
    setFeedbackMessage({
      type: 'info',
      text: 'Đã khôi phục lại trạng thái ban đầu trước khi chỉnh sửa.',
    });
  };

  const handleSaveAllChanges = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFeedbackMessage(null);

    const nextIsoDeadline = deadlineInput
      ? `${deadlineInput}T17:00:00Z`
      : task.deadline;

    const res = onSaveTaskDetail(task.id, {
      status: draftStatus,
      criteria: draftCriteria,
      ownerCode: ownerInput,
      reviewerCode: reviewerInput,
      priority: priorityInput,
      deadline: nextIsoDeadline,
      handoverToCodes: handoverToInput,
      blocker: blockerInput.trim(),
      isBlocked: blockerInput.trim().length > 0,
      notes: notesInput.trim(),
      confirmIncompleteForReview: confirmedEarlyReview,
    });

    if (res.ok) {
      setFeedbackMessage({
        type: 'success',
        text: 'Đã lưu cập nhật Task thành công và đẩy thông báo sang Discord!',
      });
    } else {
      setFeedbackMessage({
        type: 'error',
        text: res.message || 'Không thể lưu cập nhật task.',
      });
    }
  };

  const handleReviewerAction = (approved: boolean) => {
    setFeedbackMessage(null);
    const res = onReviewerDecision(task.id, approved, reviewNoteInput.trim());
    if (!res.ok) {
      setFeedbackMessage({
        type: 'error',
        text: res.message || 'Không thể thực hiện quyết định review.',
      });
    } else {
      setFeedbackMessage({
        type: 'success',
        text: approved
          ? `Reviewer ${activeMember} đã xác nhận Approve đầu ra task ${task.id}.`
          : `Reviewer ${activeMember} đã yêu cầu chỉnh sửa bổ sung cho task ${task.id}.`,
      });
    }
  };

  const handleAddCriterionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCriterionLabel.trim()) return;
    onAddCriterion(
      task.id,
      newCriterionLabel.trim(),
      newCriterionCategory,
      newCriterionMandatory,
    );
    const newCrit: TaskCriterion = {
      id: `C-${task.id}-${Date.now().toString().slice(-4)}`,
      taskId: task.id,
      label: newCriterionLabel.trim(),
      category: newCriterionCategory,
      isMandatory: newCriterionMandatory,
      isCompleted: false,
      completedBy: null,
      completedAt: null,
      sortOrder: draftCriteria.length + 1,
    };
    setDraftCriteria((prev) => [...prev, newCrit]);
    setNewCriterionLabel('');
    setFeedbackMessage({
      type: 'success',
      text: 'Đã thêm tiêu chí đầu ra mới vào checklist.',
    });
  };

  const toggleHandoverMember = (code: MemberCode) => {
    setHandoverToInput((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const getMemberName = (code: MemberCode) =>
    members.find((m) => m.memberCode === code)?.displayName || code;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
    >
      <div className="modal-panel">
        {/* Header */}
        <header className="modal-header">
          <div>
            <div className="modal-badges">
              <span className="badge badge-code">{task.id}</span>
              <span
                className={`badge badge-priority-${priorityInput.toLowerCase()}`}
              >
                {priorityInput}
              </span>
              <span className="badge badge-slice">{task.moduleSlice}</span>
              <span className="badge badge-day">{task.dayPhase}</span>
              {overdue && (
                <span className="badge badge-danger">
                  <Clock size={13} /> Quá hạn
                </span>
              )}
              {blockerInput.trim().length > 0 && (
                <span className="badge badge-danger">
                  <AlertTriangle size={13} /> Đang bị Blocker
                </span>
              )}
              {hasUnsavedChanges && (
                <span className="badge badge-unsaved">
                  ● Có thay đổi chưa lưu
                </span>
              )}
            </div>
            <h2 id="task-modal-title" className="modal-title">
              {task.title}
            </h2>
          </div>
          <button
            type="button"
            className="icon-close-btn"
            onClick={onClose}
            aria-label="Đóng chi tiết công việc"
          >
            <X size={20} />
          </button>
        </header>

        <div className="modal-body">
          {/* Feedback Alert */}
          {feedbackMessage && (
            <div
              className={`alert-banner alert-${feedbackMessage.type}`}
              role="status"
            >
              <span>{feedbackMessage.text}</span>
              {pendingReviewConfirm && (
                <div className="confirm-actions">
                  <button
                    type="button"
                    className="btn btn-warning btn-sm"
                    onClick={handleConfirmEarlyReview}
                  >
                    Xác nhận vẫn chọn Review
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setPendingReviewConfirm(false)}
                  >
                    Huỷ
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Unsaved Changes Quick Save Bar */}
          {editPerm.allowed && hasUnsavedChanges && (
            <div className="unsaved-save-bar">
              <span>
                💡 Bạn vừa thay đổi trạng thái / checklist / thông tin task.
                Hệ thống <strong>chỉ lưu và đẩy thông báo Discord</strong> khi
                bạn bấm <strong>Lưu cập nhật Task</strong>.
              </span>
              <div className="unsaved-save-actions">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={handleResetDraft}
                >
                  <RotateCcw size={14} /> Huỷ thay đổi
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSaveAllChanges()}
                >
                  <Save size={14} /> Lưu cập nhật Task
                </button>
              </div>
            </div>
          )}

          {/* Description & Deliverable Box */}
          <section className="detail-section">
            <div className="detail-grid-2">
              <div className="info-box">
                <h3>Việc cần làm (Task Specification)</h3>
                <p>{task.description}</p>
                <div className="deliverable-tag">
                  <FileCheck2 size={16} />
                  <span>
                    <strong>Đầu ra bắt buộc:</strong> {task.deliverableSummary}
                  </span>
                </div>
              </div>

              <div className="ai-copilot-box">
                <div className="ai-box-header">
                  <span className="ai-title">
                    <Bot size={16} /> MoveInMate AI Copilot
                  </span>
                  <span
                    className={`confidence-pill conf-${task.aiConfidence}`}
                  >
                    Confidence: {task.aiConfidence.toUpperCase()}
                  </span>
                </div>
                <p className="ai-suggestion-text">{task.aiSuggestion}</p>
                <small className="ai-disclaimer">
                  <Sparkles size={12} /> Minh bạch AI: AI chỉ tóm tắt & gợi ý;
                  mọi thay đổi trạng thái và phê duyệt Done bắt buộc thành viên
                  xác nhận kèm Audit Log.
                </small>
              </div>
            </div>
          </section>

          {/* Workflow Status Transition & Reviewer Gate */}
          <section className="detail-section workflow-gate-panel">
            <div className="workflow-header">
              <div>
                <h3>Trạng thái & Cổng kiểm soát chất lượng (Quality Gate)</h3>
                <p className="muted-text">
                  Chọn trạng thái bên dưới rồi bấm{' '}
                  <strong>Lưu cập nhật Task</strong> để áp dụng và gửi thông báo
                  Discord. Chuyển <strong>Done</strong> bắt buộc{' '}
                  <strong>100% tiêu chí bắt buộc</strong> +{' '}
                  <strong>Reviewer ({task.reviewerCode}) xác nhận Approve</strong>.
                </p>
              </div>
              <div className="progress-pill-large">
                <span>Tiến độ Checklist: {progress.percent}%</span>
                <small>
                  ({progress.mandatoryCompleted}/{progress.mandatoryTotal} bắt
                  buộc · {progress.completedCount}/{progress.totalCount} tổng)
                </small>
              </div>
            </div>

            <div
              className="status-stepper"
              role="group"
              aria-label="Chuyển trạng thái công việc"
            >
              {(['todo', 'in_progress', 'review', 'done'] as TaskStatus[]).map(
                (st) => {
                  const isCurrent = draftStatus === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      disabled={!editPerm.allowed}
                      onClick={() => handleStatusButtonClick(st)}
                      className={`status-step-btn status-${st} ${
                        isCurrent ? 'active' : ''
                      }`}
                    >
                      <span>{STATUS_LABELS[st]}</span>
                      {st === 'done' &&
                        (!progress.allMandatoryCompleted ||
                          !task.reviewerApproved) && <Lock size={14} />}
                    </button>
                  );
                },
              )}
            </div>

            {/* Reviewer Approval Box */}
            <div className="reviewer-gate-card">
              <div className="reviewer-status-info">
                <div className="reviewer-badge-row">
                  <UserCheck size={18} />
                  <strong>
                    Reviewer phụ trách: {getMemberName(task.reviewerCode)}
                  </strong>
                  {task.reviewerApproved ? (
                    <span className="pill-approved">
                      <ShieldCheck size={14} /> Đã xác nhận Approve bởi{' '}
                      {task.reviewerApprovedBy}
                    </span>
                  ) : (
                    <span className="pill-pending-review">
                      <ShieldAlert size={14} /> Chưa xác nhận Approve
                    </span>
                  )}
                </div>
                {task.reviewerNote && (
                  <p className="reviewer-note-display">
                    Ghi chú Reviewer: “{task.reviewerNote}”
                  </p>
                )}
              </div>

              <div className="reviewer-controls">
                <input
                  type="text"
                  value={reviewNoteInput}
                  onChange={(e) => setReviewNoteInput(e.target.value)}
                  placeholder={`Ghi chú kiểm duyệt của ${task.reviewerCode} (evidence, nhận xét)...`}
                  aria-label="Ghi chú của Reviewer"
                  disabled={!reviewPerm.allowed}
                />
                <div className="reviewer-btn-group">
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    disabled={!reviewPerm.allowed}
                    onClick={() => handleReviewerAction(true)}
                    title={
                      reviewPerm.allowed
                        ? 'Xác nhận đầu ra đạt chuẩn'
                        : reviewPerm.reason
                    }
                  >
                    <CheckCircle2 size={15} /> Reviewer Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger-outline btn-sm"
                    disabled={!reviewPerm.allowed}
                    onClick={() => handleReviewerAction(false)}
                    title={
                      reviewPerm.allowed
                        ? 'Yêu cầu chỉnh sửa bổ sung'
                        : reviewPerm.reason
                    }
                  >
                    Yêu cầu sửa (Request Changes)
                  </button>
                </div>
                {!reviewPerm.allowed && (
                  <small className="permission-hint">{reviewPerm.reason}</small>
                )}
              </div>
            </div>
          </section>

          {/* Checklist Tiêu chí đầu ra */}
          <section className="detail-section">
            <div className="section-title-row">
              <h3>
                Checklist tiêu chí đầu ra ({progress.completedCount}/
                {progress.totalCount})
              </h3>
              <span className="muted-text">
                Tick/untick các tiêu chí rồi bấm{' '}
                <strong>Lưu cập nhật Task</strong> để lưu & thông báo
              </span>
            </div>

            <ul className="criteria-list">
              {draftCriteria.map((item) => (
                <li
                  key={item.id}
                  className={`criterion-row ${
                    item.isCompleted ? 'completed' : ''
                  }`}
                >
                  <label className="criterion-label">
                    <input
                      type="checkbox"
                      checked={item.isCompleted}
                      disabled={!editPerm.allowed}
                      onChange={() => handleDraftToggleCriterion(item.id)}
                    />
                    <span className="criterion-text">{item.label}</span>
                  </label>
                  <div className="criterion-meta">
                    <span className={`cat-tag cat-${item.category}`}>
                      {CATEGORY_LABELS[item.category]}
                    </span>
                    <span
                      className={`mandatory-tag ${
                        item.isMandatory ? 'mandatory' : 'optional'
                      }`}
                    >
                      {item.isMandatory ? 'Bắt buộc' : 'Tuỳ chọn'}
                    </span>
                    {item.isCompleted && item.completedBy && (
                      <span className="completed-by-tag">
                        ✓ {item.completedBy}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {editPerm.allowed && (
              <form
                className="add-criterion-form"
                onSubmit={handleAddCriterionSubmit}
              >
                <input
                  type="text"
                  value={newCriterionLabel}
                  onChange={(e) => setNewCriterionLabel(e.target.value)}
                  placeholder="Thêm tiêu chí kiểm tra đầu ra mới..."
                  aria-label="Tên tiêu chí đầu ra mới"
                />
                <select
                  value={newCriterionCategory}
                  onChange={(e) =>
                    setNewCriterionCategory(
                      e.target.value as CriterionCategory,
                    )
                  }
                  aria-label="Nhóm tiêu chí"
                >
                  <option value="functional">Nghiệp vụ / API</option>
                  <option value="ai_quality">Chất lượng AI</option>
                  <option value="security">Bảo mật / RLS</option>
                  <option value="testing">Kiểm thử</option>
                  <option value="handover">Bàn giao</option>
                </select>
                <label className="checkbox-inline">
                  <input
                    type="checkbox"
                    checked={newCriterionMandatory}
                    onChange={(e) =>
                      setNewCriterionMandatory(e.target.checked)
                    }
                  />
                  Bắt buộc
                </label>
                <button type="submit" className="btn btn-primary btn-sm">
                  <Plus size={15} /> Thêm tiêu chí
                </button>
              </form>
            )}
          </section>

          {/* Assignment, Handover, Dependencies & Blocker Form */}
          <section className="detail-section">
            <div className="detail-grid-2">
              <form className="metadata-form" onSubmit={handleSaveAllChanges}>
                <h3>Phân công, Bàn giao, Deadline & Blocker</h3>
                <div className="form-row-2">
                  <label>
                    <span>Owner (Phụ trách chính)</span>
                    <select
                      value={ownerInput}
                      disabled={!editPerm.allowed}
                      onChange={(e) =>
                        setOwnerInput(e.target.value as MemberCode)
                      }
                    >
                      {ALL_MEMBERS.map((m) => (
                        <option key={m} value={m}>
                          {getMemberName(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Reviewer (Kiểm duyệt)</span>
                    <select
                      value={reviewerInput}
                      disabled={!editPerm.allowed}
                      onChange={(e) =>
                        setReviewerInput(e.target.value as MemberCode)
                      }
                    >
                      {ALL_MEMBERS.map((m) => (
                        <option key={m} value={m}>
                          {getMemberName(m)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="form-row-2">
                  <label>
                    <span>Mức ưu tiên</span>
                    <select
                      value={priorityInput}
                      disabled={!editPerm.allowed}
                      onChange={(e) =>
                        setPriorityInput(e.target.value as TaskPriority)
                      }
                    >
                      <option value="P0">
                        P0 · Chặn luồng chính (Critical)
                      </option>
                      <option value="P1">P1 · Quan trọng (High)</option>
                      <option value="P2">P2 · Hoàn thiện (Normal)</option>
                    </select>
                  </label>
                  <label>
                    <span>Hạn chót (Deadline)</span>
                    <input
                      type="date"
                      value={deadlineInput}
                      disabled={!editPerm.allowed}
                      onChange={(e) => setDeadlineInput(e.target.value)}
                    />
                  </label>
                </div>

                <div className="handover-picker">
                  <span>Người nhận bàn giao (Handover To):</span>
                  <div className="member-Toggle-group">
                    {ALL_MEMBERS.map((code) => (
                      <button
                        key={code}
                        type="button"
                        disabled={!editPerm.allowed}
                        onClick={() => toggleHandoverMember(code)}
                        className={`chip-toggle ${
                          handoverToInput.includes(code) ? 'selected' : ''
                        }`}
                      >
                        <Send size={12} /> {code}
                      </button>
                    ))}
                  </div>
                  <small className="muted-text">
                    Điều kiện chuyển giao: {task.handoverCondition}
                  </small>
                </div>

                <label>
                  <span>
                    Blocker / Vướng mắc hiện tại (Để trống nếu không bị chặn)
                  </span>
                  <input
                    type="text"
                    value={blockerInput}
                    disabled={!editPerm.allowed}
                    onChange={(e) => setBlockerInput(e.target.value)}
                    placeholder="Nhập nguyên nhân gây nghẽn và thành viên cần phối hợp gỡ..."
                  />
                </label>

                <label>
                  <span>Ghi chú triển khai & Evidence</span>
                  <textarea
                    rows={2}
                    value={notesInput}
                    disabled={!editPerm.allowed}
                    onChange={(e) => setNotesInput(e.target.value)}
                  />
                </label>

                {editPerm.allowed && (
                  <div className="modal-save-footer">
                    {hasUnsavedChanges && (
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={handleResetDraft}
                      >
                        <RotateCcw size={15} /> Huỷ thay đổi
                      </button>
                    )}
                    <button type="submit" className="btn btn-primary">
                      <Save size={15} /> Lưu cập nhật Task
                    </button>
                  </div>
                )}
              </form>

              {/* Dependencies & Audit History */}
              <div className="deps-and-history">
                <div className="deps-card">
                  <h3>
                    <GitBranch size={16} /> Phụ thuộc kỹ thuật (Dependencies)
                  </h3>
                  {task.dependencies.length === 0 ? (
                    <p className="muted-text">
                      Task độc lập — có thể khởi chạy ngay với dữ liệu
                      mock/fixture.
                    </p>
                  ) : (
                    <ul className="deps-list">
                      {task.dependencies.map((dep) => {
                        const upstream = allTasks.find(
                          (t) => t.id === dep.dependsOnTaskId,
                        );
                        return (
                          <li key={dep.id} className="dep-item">
                            <div>
                              <strong>{dep.dependsOnTaskId}</strong> ·{' '}
                              {upstream?.title || 'Task liên quan'}
                              <small>{dep.note}</small>
                            </div>
                            <span
                              className={`status-pill status-${
                                upstream?.status || 'todo'
                              }`}
                            >
                              {upstream?.status || 'todo'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="history-card">
                  <h3>
                    <History size={16} /> Lịch sử cập nhật & Audit (
                    {taskAuditLogs.length})
                  </h3>
                  {taskAuditLogs.length === 0 ? (
                    <p className="muted-text">
                      Chưa có bản ghi thay đổi cho task này.
                    </p>
                  ) : (
                    <ul className="mini-audit-list">
                      {taskAuditLogs.slice(0, 6).map((log) => (
                        <li key={log.id} className="mini-audit-item">
                          <div className="mini-audit-meta">
                            <strong>{log.actorCode}</strong>
                            <span>
                              {new Date(log.createdAt).toLocaleString('vi-VN')}
                            </span>
                          </div>
                          <p>{log.summary}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
