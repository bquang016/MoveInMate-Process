import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type {
  MemberCode,
  ModuleSlice,
  TaskPriority,
  TeamMember,
} from '../types/tracker';

interface NewTaskModalProps {
  members: TeamMember[];
  defaultOwner: MemberCode;
  onClose: () => void;
  onCreateTask: (payload: {
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
  }) => void;
}

const ALL_MEMBERS: MemberCode[] = ['TV1', 'TV2', 'TV3', 'TV4'];

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  members,
  defaultOwner,
  onClose,
  onCreateTask,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliverableSummary, setDeliverableSummary] = useState('');
  const [moduleSlice, setModuleSlice] = useState<ModuleSlice>('Onboarding');
  const [dayNumber, setDayNumber] = useState<number>(3);
  const [ownerCode, setOwnerCode] = useState<MemberCode>(defaultOwner);
  const [reviewerCode, setReviewerCode] = useState<MemberCode>(
    defaultOwner === 'TV1' ? 'TV2' : 'TV1',
  );
  const [handoverToCodes, setHandoverToCodes] = useState<MemberCode[]>(['TV4']);
  const [handoverCondition, setHandoverCondition] = useState(
    'Có unit test, schema validation và hướng dẫn chạy trong README module.',
  );
  const [priority, setPriority] = useState<TaskPriority>('P0');
  const [deadline, setDeadline] = useState('2026-11-16');
  const [criteriaText, setCriteriaText] = useState(
    'Hoàn thành API/UI đúng contract đã thống nhất\nBổ sung test happy path và 1 failure path\nĐính kèm ảnh chụp/log evidence bàn giao',
  );

  const toggleHandover = (code: MemberCode) => {
    setHandoverToCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    const initialCriteria = criteriaText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    onCreateTask({
      title: title.trim(),
      description: description.trim(),
      deliverableSummary:
        deliverableSummary.trim() || 'Module deliverable + test evidence',
      moduleSlice,
      dayNumber,
      ownerCode,
      reviewerCode,
      handoverToCodes,
      handoverCondition: handoverCondition.trim(),
      priority,
      deadline: `${deadline}T17:00:00Z`,
      initialCriteria:
        initialCriteria.length > 0
          ? initialCriteria
          : ['Hoàn thành đầu ra theo chuẩn Definition of Done'],
    });
    onClose();
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-task-modal-title"
    >
      <div className="modal-panel modal-panel-md">
        <header className="modal-header">
          <h2 id="new-task-modal-title" className="modal-title">
            Thêm Task mới vào Roadmap MoveInMate
          </h2>
          <button
            type="button"
            className="icon-close-btn"
            onClick={onClose}
            aria-label="Đóng cửa sổ tạo task"
          >
            <X size={20} />
          </button>
        </header>

        <form className="modal-body metadata-form" onSubmit={handleSubmit}>
          <label>
            <span>Tiêu đề Task *</span>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Tích hợp citation badge vào màn hình checklist cư dân..."
            />
          </label>

          <label>
            <span>Mô tả chi tiết việc cần làm *</span>
            <textarea
              rows={3}
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả rõ đầu vào, xử lý AI/backend/frontend và tiêu chuẩn kiểm thử..."
            />
          </label>

          <div className="form-row-2">
            <label>
              <span>Vertical Slice / Module</span>
              <select
                value={moduleSlice}
                onChange={(e) => setModuleSlice(e.target.value as ModuleSlice)}
              >
                <option value="Onboarding">TV1 · Onboarding</option>
                <option value="RAG">TV2 · RAG Knowledge</option>
                <option value="Service & DevOps">TV3 · Service & DevOps</option>
                <option value="BQL Copilot & UX">TV4 · BQL Copilot & UX</option>
              </select>
            </label>
            <label>
              <span>Ngày thực hiện (Day 1–7)</span>
              <select
                value={dayNumber}
                onChange={(e) => setDayNumber(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    Ngày {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-row-2">
            <label>
              <span>Owner (Người thực hiện)</span>
              <select
                value={ownerCode}
                onChange={(e) => setOwnerCode(e.target.value as MemberCode)}
              >
                {members.map((m) => (
                  <option key={m.memberCode} value={m.memberCode}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Reviewer (Người kiểm duyệt)</span>
              <select
                value={reviewerCode}
                onChange={(e) => setReviewerCode(e.target.value as MemberCode)}
              >
                {members.map((m) => (
                  <option key={m.memberCode} value={m.memberCode}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="form-row-2">
            <label>
              <span>Mức độ ưu tiên</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
              >
                <option value="P0">P0 · Critical</option>
                <option value="P1">P1 · High</option>
                <option value="P2">P2 · Normal</option>
              </select>
            </label>
            <label>
              <span>Deadline</span>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
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
                  onClick={() => toggleHandover(code)}
                  className={`chip-toggle ${
                    handoverToCodes.includes(code) ? 'selected' : ''
                  }`}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>

          <label>
            <span>Đầu ra tóm tắt (Deliverable)</span>
            <input
              type="text"
              value={deliverableSummary}
              onChange={(e) => setDeliverableSummary(e.target.value)}
              placeholder="VD: API endpoint + 10 test cases + screenshot"
            />
          </label>

          <label>
            <span>Điều kiện bàn giao (Handover Condition)</span>
            <input
              type="text"
              value={handoverCondition}
              onChange={(e) => setHandoverCondition(e.target.value)}
              placeholder="VD: Có unit test, schema validation và hướng dẫn chạy..."
            />
          </label>

          <label>
            <span>
              Checklist tiêu chí đầu ra bắt buộc (Mỗi dòng là 1 tiêu chí)
            </span>
            <textarea
              rows={3}
              value={criteriaText}
              onChange={(e) => setCriteriaText(e.target.value)}
            />
          </label>

          <div className="modal-footer-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
            >
              Huỷ
            </button>
            <button type="submit" className="btn btn-primary">
              <Plus size={16} /> Tạo Task mới
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
