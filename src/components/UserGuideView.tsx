import React from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FastForward,
  FolderKanban,
  History,
  KeyRound,
  Lock,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import type { MemberCode, TeamMember } from '../types/tracker';

interface UserGuideViewProps {
  members: TeamMember[];
  onJumpToMemberRoadmap: (code: MemberCode) => void;
  onOpenAuthModal: () => void;
}

export const UserGuideView: React.FC<UserGuideViewProps> = ({
  members,
  onJumpToMemberRoadmap,
  onOpenAuthModal,
}) => {
  return (
    <div className="guide-container">
      {/* Hero Banner */}
      <div className="guide-hero">
        <div className="guide-hero-content">
          <span className="eyebrow-pill">
            <BookOpen size={13} /> Cẩm nang Vận hành Nhóm · MoveInMate VHR-16
          </span>
          <h2>Hướng dẫn Sử dụng Chi tiết — MoveInMate Team Progress Tracker</h2>
          <p>
            Trang web này được thiết kế riêng cho đội ngũ 4 thành viên triển khai{' '}
            <strong>MoveInMate AI (VHR-16)</strong> trong 7 ngày theo mô hình{' '}
            <strong>4 Vertical Slices chạy song song</strong>. Mọi thao tác tick
            checklist, đẩy Review, duyệt đầu ra và báo Blocker đều đồng bộ thời
            gian thực qua <strong>Supabase Realtime</strong>.
          </p>
          <div className="guide-hero-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={onOpenAuthModal}
            >
              <KeyRound size={15} /> Đăng nhập Tài khoản Thành viên
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => onJumpToMemberRoadmap('TV1')}
            >
              <CalendarDays size={15} /> Mở ngay Lộ trình 7 Ngày
            </button>
          </div>
        </div>
      </div>

      {/* Section 1: 4 Real Team Members & Accounts */}
      <section className="guide-section">
        <div className="guide-section-header">
          <span className="guide-step-badge">Phần 1</span>
          <div>
            <h3>
              <Users size={18} /> Danh sách 4 Thành viên, Tài khoản & Phân công
              Vertical Slice
            </h3>
            <p className="muted-text">
              Mỗi thành viên sở hữu <strong>1 Vertical Slice độc lập</strong> (7
              task từ Ngày 1 → Ngày 7) và <strong>1 Vai trò ngang</strong> kiểm
              duyệt chéo cho đồng đội.
            </p>
          </div>
        </div>

        <div className="guide-member-cards">
          {members.map((m) => (
            <div
              key={m.memberCode}
              className="guide-member-card"
              style={{ '--member-color': m.colorHex } as React.CSSProperties}
            >
              <div className="guide-member-head">
                <span className="guide-member-code">{m.memberCode}</span>
                <div>
                  <h4>{m.displayName}</h4>
                  <code className="guide-email-tag">{m.email}</code>
                </div>
              </div>
              <div className="guide-member-body">
                <p>
                  <strong>Vertical Slice:</strong> {m.sliceName}
                </p>
                <p>
                  <strong>Vai trò chung:</strong> {m.crossRole}
                </p>
                <div className="guide-deliverables">
                  <strong>Đầu ra chịu trách nhiệm chính:</strong>
                  <ul>
                    {m.finalDeliverables.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="guide-member-foot">
                <button
                  type="button"
                  className="btn btn-outline btn-xs"
                  onClick={() => onJumpToMemberRoadmap(m.memberCode)}
                >
                  Xem 7 ngày của {m.memberCode} →
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 2: Step-by-step Daily Workflow */}
      <section className="guide-section">
        <div className="guide-section-header">
          <span className="guide-step-badge">Phần 2</span>
          <div>
            <h3>
              <ClipboardCheck size={18} /> Quy trình Làm việc Hàng ngày (4 Bước
              Chuẩn)
            </h3>
            <p className="muted-text">
              Thực hiện đúng 4 bước dưới đây để tiến độ cá nhân và tiến độ toàn
              dự án tự động cập nhật chính xác 100%.
            </p>
          </div>
        </div>

        <div className="guide-steps-grid">
          <div className="guide-step-card">
            <div className="step-num">Bước 1</div>
            <h4>
              <KeyRound size={16} /> Đăng nhập & Chọn đúng Thành viên
            </h4>
            <p>
              Bấm nút <strong>Tài khoản & RLS</strong> ở góc phải trên cùng để
              đăng nhập bằng email của bạn, hoặc chọn nhanh nút{' '}
              <code>TV1</code>, <code>TV2</code>, <code>TV3</code>,{' '}
              <code>TV4</code> tại khung <strong>Phiên làm việc hiện tại</strong>.
            </p>
            <div className="guide-tip-box">
              Khi chọn tên mình, hệ thống tự động lọc ra đúng 7 ngày công việc
              của bạn và cấp quyền chỉnh sửa các task bạn làm Owner/Reviewer.
            </div>
          </div>

          <div className="guide-step-card">
            <div className="step-num">Bước 2</div>
            <h4>
              <Play size={16} /> Mở Task trong Ngày & Tick Checklist
            </h4>
            <p>
              Vào tab <strong>Lộ trình 7 Ngày</strong>. Tại ngày đang làm, bấm{' '}
              <strong>“Bắt đầu làm Ngày X”</strong> hoặc{' '}
              <strong>tick trực tiếp vào từng ô tiêu chí (Checklist)</strong> ngay
              trên thẻ ngày.
            </p>
            <div className="guide-tip-box">
              Ngay khi bạn tick tiêu chí đầu tiên, task sẽ tự động chuyển từ{' '}
              <code>Todo</code> sang <code>In Progress</code> và cộng % tiến độ
              tức thì.
            </div>
          </div>

          <div className="guide-step-card">
            <div className="step-num">Bước 3</div>
            <h4>
              <Send size={16} /> Gửi đồng đội Review (Chuyển sang Review)
            </h4>
            <p>
              Sau khi hoàn thành các tiêu chí trong ngày, bấm nút{' '}
              <strong>“Gửi TVx Review”</strong>. Bạn cũng có thể bấm vào tiêu đề
              task để mở cửa sổ chi tiết, ghi chú link PR/evidence hoặc báo
              Blocker.
            </p>
            <div className="guide-tip-box">
              Trên thẻ thành viên của người Reviewer sẽ hiện ngay huy hiệu nhắc{' '}
              <code>Cần review: 1</code>.
            </div>
          </div>

          <div className="guide-step-card">
            <div className="step-num">Bước 4</div>
            <h4>
              <ShieldCheck size={16} /> Reviewer Bấm Approve & Đóng Done
            </h4>
            <p>
              Người giữ vai trò <strong>Reviewer</strong> của task đó kiểm tra
              đầu ra và bấm <strong>“Approve”</strong> (hoặc{' '}
              <em>Request Changes</em> nếu cần sửa). Khi đã đủ 100% tiêu chí bắt
              buộc + Reviewer Approve, bấm <strong>“Chuyển sang Done”</strong>.
            </p>
            <div className="guide-tip-box">
              Cổng kiểm soát chất lượng kép chặn việc tự ý lên <code>Done</code>{' '}
              khi chưa tick đủ tiêu chí bắt buộc hoặc chưa được Reviewer duyệt.
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Fast-Forward / Working Ahead Guide */}
      <section className="guide-section guide-highlight-section">
        <div className="guide-section-header">
          <span className="guide-step-badge badge-accent">Tính năng Đặc biệt</span>
          <div>
            <h3>
              <FastForward size={18} /> Cơ chế Làm vượt tiến độ (Xong Ngày 1 làm
              luôn Ngày 2, 3, 4...)
            </h3>
            <p className="muted-text">
              Không bắt buộc phải chờ sang ngày hôm sau mới được mở task của
              ngày tiếp theo.
            </p>
          </div>
        </div>

        <div className="guide-fastforward-grid">
          <div className="guide-ff-item">
            <strong>1. Xem trước toàn bộ 7 ngày của riêng bạn</strong>
            <p>
              Trong tab <strong>Lộ trình 7 Ngày</strong>, chọn thanh{' '}
              <code>Tất cả 7 Ngày</code>. Bạn sẽ thấy đầy đủ danh sách việc từ{' '}
              <strong>Ngày 1 đến Ngày 7</strong> của mình theo thứ tự từ trên
              xuống dưới.
            </p>
          </div>
          <div className="guide-ff-item">
            <strong>2. Mở sớm bất kỳ ngày nào (Ngày 2, 3, 4...)</strong>
            <p>
              Nếu làm nhanh và hoàn thành sớm Ngày 1, bạn chỉ cần kéo xuống thẻ{' '}
              <strong>Ngày 2</strong> hoặc <strong>Ngày 3</strong> rồi bấm{' '}
              <strong>“Bắt đầu làm Ngày 2”</strong> hoặc tick luôn vào checklist
              của ngày đó.
            </p>
          </div>
          <div className="guide-ff-item">
            <strong>3. Chủ động dùng Mock JSON khi chờ đồng đội</strong>
            <p>
              Theo thiết kế MoveInMate VHR-16, các ngày đầu đều đã chốt{' '}
              <code>API Contract</code> và <code>Mock JSON</code>. Vì vậy nếu
              slice của bạn làm nhanh hơn, bạn vẫn làm tiếp Ngày 2, 3 bình
              thường mà không bị phụ thuộc cứng.
            </p>
          </div>
        </div>
      </section>

      {/* Section 4: Overview of All 5 Tabs & Security / RLS */}
      <section className="guide-section">
        <div className="guide-section-header">
          <span className="guide-step-badge">Phần 3</span>
          <div>
            <h3>
              <FolderKanban size={18} /> Ý nghĩa các Màn hình (Tabs) & Quy tắc
              Phân quyền
            </h3>
            <p className="muted-text">
              Tổng hợp toàn bộ công cụ có sẵn trên thanh điều hướng của ứng
              dụng.
            </p>
          </div>
        </div>

        <div className="guide-features-table-wrap">
          <table className="tracker-table">
            <thead>
              <tr>
                <th>Màn hình / Tính năng</th>
                <th>Mục đích sử dụng</th>
                <th>Ai có quyền thao tác?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>
                    <CalendarDays size={14} /> 1. Lộ trình 7 Ngày
                  </strong>
                </td>
                <td>
                  Xem chi tiết công việc từng ngày (Ngày 1 → Ngày 7) của từng
                  thành viên, tick checklist trực tiếp và bấm vượt tiến độ sang
                  ngày tiếp theo.
                </td>
                <td>
                  <strong>Owner</strong> tick checklist & đổi trạng thái;{' '}
                  <strong>Reviewer</strong> bấm Approve.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>
                    <FolderKanban size={14} /> 2. Task Board (Kanban)
                  </strong>
                </td>
                <td>
                  Quan sát trực quan 4 cột trạng thái (<code>Todo</code>,{' '}
                  <code>In Progress</code>, <code>Review</code>,{' '}
                  <code>Done</code>) để họp daily standup 10 phút mỗi tối.
                </td>
                <td>Cả nhóm xem; lọc nhanh theo thành viên, ngày, ưu tiên.</td>
              </tr>
              <tr>
                <td>
                  <strong>
                    <CheckCircle2 size={14} /> 3. Bảng Tổng hợp
                  </strong>
                </td>
                <td>
                  Bảng tra cứu toàn bộ 28 đầu việc kèm hạn chót, người nhận bàn
                  giao và phần trăm hoàn thành.
                </td>
                <td>Cả nhóm tra cứu và tìm kiếm nhanh theo từ khoá.</td>
              </tr>
              <tr>
                <td>
                  <strong>
                    <ArrowRightLeft size={14} /> 4. Điểm giao Bàn giao
                  </strong>
                </td>
                <td>
                  Theo dõi 4 điểm giao cắt quan trọng (<code>HO-01</code> →{' '}
                  <code>HO-04</code>) giữa TV1, TV2, TV3, TV4 và bảng chuẩn
                  Quality Gates nghiệm thu MVP.
                </td>
                <td>
                  Thành viên đã xác thực cập nhật trạng thái{' '}
                  <code>Pending → Ready → Accepted</code>.
                </td>
              </tr>
              <tr>
                <td>
                  <strong>
                    <History size={14} /> 5. Lịch sử Cập nhật (Audit Log)
                  </strong>
                </td>
                <td>
                  Lưu vết tự động theo thời gian thực: ai vừa tick tiêu chí nào,
                  ai chuyển trạng thái, ai duyệt Review hay báo Blocker.
                </td>
                <td>Tự động ghi nhận 100% thao tác, không ai có thể sửa xoá.</td>
              </tr>
              <tr>
                <td>
                  <strong>
                    <AlertTriangle size={14} /> Báo cáo Blocker khẩn
                  </strong>
                </td>
                <td>
                  Mở chi tiết task → nhập ô <strong>Blocker hiện tại</strong> và
                  bật cảnh báo. Một dải băng đỏ sẽ hiện ngay trên đầu trang để
                  Integration Lead (TV1) và cả nhóm hỗ trợ gỡ vướng mắc.
                </td>
                <td>Owner hoặc Reviewer của task đó.</td>
              </tr>
              <tr>
                <td>
                  <strong>
                    <Lock size={14} /> Kiểm thử Khách ngoài (RLS)
                  </strong>
                </td>
                <td>
                  Nút <strong>Khách ngoài</strong> trên thanh chọn phiên dùng để
                  demo bảo mật Row Level Security: người không thuộc danh sách 4
                  thành viên sẽ bị khoá toàn bộ quyền chỉnh sửa.
                </td>
                <td>Chế độ chỉ đọc / kiểm thử bảo mật.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="guide-footer-note">
          <Sparkles size={16} />
          <span>
            <strong>Mẹo họp nhóm 10 phút cuối ngày:</strong> Mở tab{' '}
            <strong>Lộ trình 7 Ngày</strong> → bấm chọn lần lượt{' '}
            <code>TV1</code>, <code>TV2</code>, <code>TV3</code>,{' '}
            <code>TV4</code> để xem ai đã xong ngày hôm nay, ai đang chờ
            Reviewer duyệt và ai cần hỗ trợ gỡ Blocker.
          </span>
        </div>
      </section>
    </div>
  );
};

