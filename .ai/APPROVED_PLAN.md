# Approved Plan

- **Schema Version**: 1.0
- **Workspace ID**: ws_afe4a5e56ffeefdcb56b3fd60683606a
- **Task ID**: moveinmate-team-progress-tracker
- **Approved**: true
- **Approved at**: 2026-11-14T03:26:11.648Z

## Objective
Xây dựng trong workspace BuildPhase một ứng dụng web hoàn chỉnh để nhóm 4 thành viên MoveInMate AI cùng đăng nhập, quản lý và theo dõi tiến độ công việc theo thời gian thực. Mỗi task phải mô tả rõ việc cần làm, owner, reviewer, người nhận bàn giao, trạng thái, deadline, blocker, checklist tiêu chí đầu ra, lịch sử thay đổi và mức độ hoàn thành. Ứng dụng dùng Supabase Auth, PostgreSQL/Realtime và RLS; cấu hình môi trường để trống để người dùng tự điền sau.

## Plan Steps
1. Khảo sát source hiện có trong BuildPhase, đọc README/package/AGENTS và xác định framework; nếu trống thì khởi tạo stack phù hợp, ưu tiên Next.js TypeScript hoặc Vite React TypeScript cho triển khai nhanh.
2. Thiết kế thông tin kiến trúc và schema dữ liệu gồm profiles/team_members, tasks, task_criteria, task_dependencies, task_comments hoặc blockers, task_history/audit_logs, handovers và notifications nếu cần.
3. Tạo Supabase SQL migrations/seed, trigger updated_at/audit/realtime cần thiết và RLS policies: thành viên đã xác thực chỉ truy cập workspace được phân quyền; owner/reviewer có quyền cập nhật phù hợp; ngăn người ngoài và cross-workspace access.
4. Tạo cấu hình .env.example và .env trống, cập nhật .gitignore; viết lớp Supabase client/server và cơ chế phát hiện thiếu cấu hình để chuyển sang demo mode an toàn.
5. Xây authentication: đăng nhập thành viên, đăng xuất, phiên người dùng và màn hình unauthorized/setup; không tự tạo cơ chế lưu mật khẩu riêng.
6. Xây dashboard tổng quan: tiến độ toàn dự án, thanh tiến độ TV1–TV4, số task Todo/In Progress/Review/Done, task quá hạn, blocker và hoạt động gần đây.
7. Xây task board và danh sách task có filter theo thành viên/trạng thái/ưu tiên/module; hỗ trợ trạng thái Todo, In Progress, Review, Done.
8. Xây trang chi tiết/chỉnh sửa task: mô tả phải làm gì, owner, reviewer, handover_to, deadline, priority, dependencies, blocker, checklist tiêu chí đầu ra, ghi chú và lịch sử cập nhật.
9. Chỉ cho chuyển task sang Review khi checklist bắt buộc đã được tick hoặc hiển thị cảnh báo xác nhận; chỉ cho Done khi reviewer đã xác nhận và toàn bộ tiêu chí bắt buộc hoàn thành.
10. Tạo seed roadmap MoveInMate cho 4 vertical slices: TV1 Onboarding, TV2 RAG, TV3 Service Request/Security/DevOps, TV4 BQL Copilot/HITL/UX/Documentation; mỗi task có tiêu chí đầu ra và quan hệ bàn giao cụ thể.
11. Tích hợp Supabase Realtime để cập nhật task, checklist, blocker và activity giữa các trình duyệt; xử lý reconnect/loading/error/empty states.
12. Hoàn thiện responsive mobile-first, accessibility cơ bản, toast/confirmation, trạng thái AI minh bạch và giao diện chuyên nghiệp.
13. Viết test cho logic tính progress, workflow transition, quyền cập nhật và validation; thêm smoke/integration tests phù hợp với stack.
14. Viết README setup Supabase, chạy SQL, tạo member, điền env, chạy local, build và deploy Vercel; cung cấp test accounts/seed hướng dẫn mà không chứa secret.
15. Chạy format/lint/typecheck/test/build, sửa lỗi, ghi kết quả vào Project Memory và bàn giao danh sách file thay đổi, URL local nếu có, known limitations và bước chính xác để người dùng điền env/deploy.

## Acceptance Criteria
- Ứng dụng khởi chạy được theo README và build production thành công.
- Có màn hình đăng nhập/đăng xuất bằng Supabase Auth khi đã cấu hình môi trường.
- Khi chưa có env, ứng dụng vào demo mode có dữ liệu giả lập và không crash.
- Dashboard hiển thị tiến độ toàn dự án và tiến độ từng TV1–TV4.
- Mỗi task có title, mô tả việc phải làm, owner, reviewer, handover_to, deadline, priority, status, blocker và dependencies.
- Mỗi task có checklist tiêu chí đầu ra; tick/untick cập nhật đúng phần trăm hoàn thành.
- Có đầy đủ trạng thái Todo, In Progress, Review và Done cùng validation chuyển trạng thái.
- Task không được đánh dấu Done nếu thiếu tiêu chí bắt buộc hoặc chưa được reviewer xác nhận.
- Có lịch sử cập nhật/audit thể hiện ai thay đổi gì và thời điểm nào.
- Có Supabase Realtime cho thay đổi task/checklist/activity khi env được cấu hình.
- Có SQL schema/migrations, seed data và RLS policies; test hoặc hướng dẫn xác minh người ngoài/cross-workspace không đọc ghi được dữ liệu.
- Có roadmap seed cụ thể cho bốn thành viên và các quan hệ hỗ trợ, review, bàn giao giữa họ.
- UI responsive trên desktop và mobile, có loading, empty, error và success states.
- .env và .env.example được tạo đúng yêu cầu; .env không bị commit và không chứa giá trị thật.
- README mô tả đầy đủ setup Supabase, chạy local, test, build và deploy.
- Có kết quả lint/typecheck/test/build và không còn lỗi chặn bàn giao.
- Không sửa/xóa dữ liệu hoặc source ngoài phạm vi BuildPhase.

## Constraints
- Ưu tiên tốc độ triển khai, độ ổn định và trải nghiệm responsive; tránh over-engineering.
- Làm trực tiếp trong workspace BuildPhase hiện tại.
- Không hard-code API key, URL dịch vụ, mật khẩu hoặc secret.
- Tạo .env.example có đầy đủ tên biến và tạo .env với giá trị trống; bảo đảm .env nằm trong .gitignore.
- Dùng Supabase Auth, Database, Realtime và Row Level Security cho dữ liệu cộng tác.
- Phải có chế độ demo/mock hợp lý khi chưa điền biến môi trường để vẫn xem và kiểm thử UI; hiển thị rõ đây là demo mode.
- Giữ phạm vi MVP cho nhóm 4 người TV1–TV4 nhưng thiết kế dữ liệu cho phép đổi tên và mở rộng thành viên.
- Không dùng dữ liệu cá nhân thật; seed data phải là dữ liệu giả lập.
- AI chỉ đề xuất/tóm tắt; các quyết định duyệt và thay đổi trạng thái quan trọng phải lưu người thực hiện và audit log.
- Phải chạy build, lint/typecheck nếu có, test trọng yếu và ghi lại kết quả trước khi bàn giao.
- Không deploy nếu chưa có credentials hoặc nếu deployment yêu cầu mở quyền công khai ngoài phạm vi người dùng đã cho phép; thay vào đó chuẩn bị hướng dẫn deploy rõ ràng.
