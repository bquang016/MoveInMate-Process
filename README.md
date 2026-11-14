# MoveInMate AI — Team Progress & Handover Tracker (`VHR-16`)

Ứng dụng web cộng tác theo thời gian thực dành cho nhóm **4 thành viên MoveInMate AI (`TV1–TV4`)** nhằm quản lý tiến độ triển khai MVP 7 ngày theo **4 Vertical Slices**, theo dõi **checklist tiêu chí đầu ra**, **quan hệ bàn giao (handover)**, **blocker**, **audit log** và **cổng kiểm duyệt Reviewer (Quality Gate)** trước khi chuyển task sang `Done`.

---

## 1. Tính năng cốt lõi

1. **Dashboard Tiến độ Thời gian thực (`TV1–TV4`)**:
   - Hiển thị phần trăm hoàn thành toàn dự án và tổng số tiêu chí đầu ra đã tick.
   - 6 chỉ số KPI tức thời: `Todo`, `In Progress`, `Review`, `Done`, `Task Quá hạn`, `Đang có Blocker`.
   - 4 thẻ tiến độ riêng cho từng thành viên (**TV1 · Onboarding**, **TV2 · Knowledge RAG**, **TV3 · Service & DevOps**, **TV4 · BQL Copilot & UX**), cho phép **nhấp đúp hoặc bấm "Đổi tên"** để thay bằng tên thật của từng bạn.
2. **Task Board (Kanban 4 cột) & Danh sách Lộ trình 7 Ngày**:
   - Lọc đa chiều theo thành viên (`TV1–TV4`), vai trò (`Owner / Reviewer / Người nhận bàn giao`), trạng thái (`Todo / In Progress / Review / Done`), mức ưu tiên (`P0 / P1 / P2`), module slice, hoặc lọc nhanh các task đang bị **Blocker / Quá hạn**.
3. **Chi tiết Task, Checklist Tiêu chí Đầu ra & Cổng Kiểm duyệt Kép**:
   - Mỗi task lưu rõ: việc cần làm, đầu ra bắt buộc (`deliverable_summary`), `owner`, `reviewer`, `supporters`, `handover_to`, điều kiện bàn giao, `dependencies`, `deadline`, `blocker`, ghi chú và đề xuất minh bạch từ **MoveInMate AI Copilot** (`AI chỉ đề xuất · người thật quyết định`).
   - **Quy tắc chuyển sang `Review`**: Yêu cầu hoàn thành toàn bộ tiêu chí bắt buộc; nếu gửi sớm sẽ hiển thị **cảnh báo xác nhận** và ghi rõ vào Audit Log.
   - **Quy tắc chuyển sang `Done` (Quality Gate kép ở cả UI & PostgreSQL Trigger)**: Bắt buộc **100% tiêu chí bắt buộc đã tick** VÀ **Reviewer được phân công đã bấm Approve**.
4. **Điểm giao Bàn giao (`Collaboration Map`) & Nhật ký Audit (`Audit Logs`)**:
   - Quản lý các điểm giao nhau giữa 4 thành viên (`Profile → Checklist`, `Corpus → Vector Index`, `Ticket → Department`, `Auth + Tenant Isolation`).
   - Lưu vết đầy đủ ai thay đổi trạng thái, tick tiêu chí, gắn blocker hay duyệt bài và vào thời điểm nào.
5. **Chế độ Demo Mode An toàn & Supabase Live Mode (`Auth + DB + Realtime + RLS`)**:
   - Khi tệp `.env` để trống (mặc định sau khi clone), ứng dụng **không crash** mà tự động khởi chạy ở **Demo Mode** với đầy đủ dữ liệu giả lập MoveInMate `VHR-16` và đồng bộ đa tab qua `BroadcastChannel`.
   - Khi điền `.env` Supabase, ứng dụng kích hoạt **Supabase Auth**, **PostgreSQL**, **Supabase Realtime** (`postgres_changes`) và **Row Level Security (RLS)** chống truy cập trái phép hoặc rò rỉ dữ liệu chéo workspace.

---

## 2. Cấu trúc thư mục chính

```text
BuildPhase/
├── .env.example                                   # Mẫu cấu hình biến môi trường đầy đủ
├── .env                                           # Biến môi trường để trống (đã nằm trong .gitignore)
├── .gitignore                                     # Bảo vệ không commit .env, node_modules, dist
├── moveinmate-roadmap-4-thanh-vien.html           # Tài liệu Playbook Roadmap 4 thành viên gốc
├── supabase/
│   ├── migrations/
│   │   └── 20261114000001_schema_and_rls.sql      # Schema 7 bảng, Trigger cổng Done, RLS & Realtime
│   └── seed.sql                                   # Seed dữ liệu synthetic cho TV1–TV4 & workspace cách ly
└── src/
    ├── types/tracker.ts                           # Kiểu dữ liệu TypeScript cho toàn bộ domain
    ├── lib/workflow.ts                            # Logic tính tiến độ, kiểm tra quyền & cổng chuyển trạng thái
    ├── lib/supabase.ts                            # Kết nối Supabase Auth/DB/Realtime & tự động phát hiện Demo Mode
    ├── data/seedData.ts                           # Dữ liệu giả lập cho 4 vertical slices TV1–TV4
    ├── components/
    │   ├── TaskDetailModal.tsx                    # Modal chi tiết task, checklist, reviewer gate & lịch sử
    │   ├── NewTaskModal.tsx                       # Modal thêm task mới vào roadmap
    │   └── SupabaseSetupModal.tsx                 # Đăng nhập Supabase Auth, đổi vai trò Demo & hướng dẫn RLS
    ├── test/
    │   ├── workflow.test.ts                       # Unit tests cho tiến độ, workflow gate, quyền & RLS
    │   └── app.integration.test.tsx               # Smoke & integration tests cho luồng giao diện
    └── App.tsx                                    # Giao diện chính của ứng dụng
```

---

## 3. Hướng dẫn chạy Local (Ngay cả khi chưa có Supabase)

```bash
# 1. Cài đặt dependencies
npm install

# 2. Chạy server phát triển (tự động vào Demo Mode nếu .env đang để trống)
npm run dev
```

Mở trình duyệt tại địa chỉ Vite hiển thị (mặc định `http://localhost:5173`).

### Các lệnh kiểm tra chất lượng trước bàn giao

```bash
npm run lint        # Kiểm tra ESLint
npm run typecheck   # Kiểm tra kiểu TypeScript (tsc --noEmit)
npm test            # Chạy toàn bộ Unit & Integration Tests (Vitest)
npm run build       # Build bản Production vào thư mục dist/
```

---

## 4. Hướng dẫn Setup Supabase (Auth, Database, Realtime & RLS)

### Bước 1: Tạo Project trên Supabase & Chạy SQL
1. Tạo một project mới trên [Supabase Dashboard](https://supabase.com/dashboard).
2. Vào **SQL Editor**, mở và chạy lần lượt 2 tệp trong kho mã nguồn này:
   - `supabase/migrations/20261114000001_schema_and_rls.sql`
   - `supabase/seed.sql`

### Bước 2: Tạo 4 tài khoản Thành viên trong Supabase Authentication
Vào **Authentication → Users → Add User → Create New User** và tạo 4 tài khoản tương ứng với 4 thành viên trong bảng `public.team_members` (mật khẩu do bạn tự đặt trên Supabase Auth, tuyệt đối không lưu mật khẩu cứng trong code):

| Mã TV | Vai trò Vertical Slice | Vai trò Xuyên suốt | Email mặc định trong `seed.sql` |
| :--- | :--- | :--- | :--- |
| **TV1** | Onboarding & Checklist | Integration Lead | `tv1.onboarding@moveinmate.demo.local` |
| **TV2** | Knowledge RAG & Citation | Data & AI Quality Lead | `tv2.rag@moveinmate.demo.local` |
| **TV3** | Service Request & Routing | Security & DevOps Lead | `tv3.devops@moveinmate.demo.local` |
| **TV4** | BQL Copilot & HITL | UX & Documentation Lead | `tv4.copilot@moveinmate.demo.local` |

*(Bạn có thể sửa cột `email` và `display_name` trong bảng `public.team_members` sang email thật của 4 thành viên trong nhóm).*

### Bước 3: Điền biến môi trường vào tệp `.env`
Mở tệp `.env` (đã được tạo sẵn với giá trị trống và được loại trừ trong `.gitignore`) và điền thông tin từ **Supabase Project Settings → API**:

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-public-key>
VITE_DEFAULT_WORKSPACE_SLUG=moveinmate-vhr16
VITE_APP_NAME=MoveInMate AI Team Progress Tracker
```

Khởi động lại `npm run dev` — thanh trạng thái trên cùng sẽ chuyển sang **Supabase Live Mode (Realtime: Đã kết nối)**.

---

## 5. Cách xác minh Bảo mật Row Level Security (RLS) & Cổng Chất lượng

1. **Kiểm thử trên Giao diện**:
   - Chuyển phiên làm việc sang nút **`Khách ngoài`** trên thanh chọn thành viên: ứng dụng kích hoạt cảnh báo chặn quyền RLS và khoá toàn bộ nút chỉnh sửa/tick checklist/duyệt bài.
   - Mở một task đang ở trạng thái `Review` (ví dụ `T-TV1-02`, Reviewer là `TV4`) khi đang đăng nhập là `TV1`: nút **Reviewer Approve** bị khoá và việc bấm chuyển sang `Done` bị từ chối cho tới khi `TV4` đăng nhập và bấm **Reviewer Approve**.
2. **Kiểm thử trên Supabase SQL Editor (Cross-Workspace & Anonymous Isolation)**:
   - Tệp `supabase/seed.sql` tạo sẵn workspace thứ hai `other-team-isolated` (`22222222-2222-4222-8222-222222222222`).
   - Nhờ hàm `public.is_workspace_member(workspace_id)` trong RLS policy, user không thuộc `team_members` của workspace `moveinmate-vhr16` sẽ nhận `0 rows` khi `SELECT` và bị từ chối khi `INSERT/UPDATE` trên cả 7 bảng (`workspaces`, `team_members`, `tasks`, `task_criteria`, `task_dependencies`, `handovers`, `audit_logs`).
   - Trigger PostgreSQL `enforce_task_workflow_gate()` chặn trực tiếp lệnh `UPDATE public.tasks SET status = 'done'` nếu `reviewer_approved = false` hoặc còn tiêu chí `is_mandatory = true` chưa hoàn thành.

---

## 6. Hướng dẫn Deploy lên Vercel

1. Đẩy repository lên GitHub (kiểm tra `git status` để chắc chắn `.env` không nằm trong danh sách staged).
2. Vào [Vercel](https://vercel.com/new) → Import repository.
3. Cấu hình:
   - **Framework Preset**: `Vite`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Trong mục **Environment Variables** trên Vercel, thêm:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_DEFAULT_WORKSPACE_SLUG` (`moveinmate-vhr16`)
5. Bấm **Deploy**. Nếu chưa điền biến môi trường trên Vercel, bản deploy vẫn hoạt động ở **Demo Mode** để trình diễn giao diện và luồng nghiệp vụ.

