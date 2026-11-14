# Architecture & Workflow Decisions

> Append-only architecture and workflow decisions.
> Record each decision with timestamp, context, decision, rationale, and consequences.

## [2026-11-14] Stack Selection: Vite + React 19 + TypeScript + Vitest + Supabase JS
- **Context**: Workspace `BuildPhase` chứa tài liệu đặc tả `moveinmate-roadmap-4-thanh-vien.html` và yêu cầu xây dựng nhanh một ứng dụng cộng tác thời gian thực có Supabase Auth, Database, Realtime, RLS và Demo Mode khi `.env` trống.
- **Decision**: Sử dụng Vite + React 19 + TypeScript + `@supabase/supabase-js` + Vitest + Testing Library.
- **Rationale**: Tốc độ khởi tạo và build rất nhanh, kiểm tra kiểu nghiêm ngặt (`tsc -b`), dễ dàng chạy unit/integration test với `jsdom`, và an toàn tuyệt đối khi biến môi trường `.env` để trống (tự động chuyển sang Demo Mode + đồng bộ đa tab qua `BroadcastChannel`).
- **Consequences**: Triển khai gọn nhẹ, dễ dàng deploy tĩnh hoặc serverless lên Vercel, tách biệt rõ ràng giữa domain logic (`src/lib/workflow.ts`) và hạ tầng Supabase (`src/lib/supabase.ts` + `supabase/migrations/`).

## [2026-11-14] Dual-Layer Quality Gate (UI + PostgreSQL Trigger & RLS)
- **Context**: Yêu cầu nghiệp vụ bắt buộc task không được đánh dấu `Done` nếu thiếu tiêu chí bắt buộc hoặc chưa được Reviewer xác nhận, đồng thời chặn người ngoài và cross-workspace access.
- **Decision**: Thực thi kiểm tra kép ở cả tầng hàm domain (`validateStatusTransition`, `canMemberPerformAction`) và tầng cơ sở dữ liệu PostgreSQL (`enforce_task_workflow_gate()` trigger + RLS policies dựa trên `public.is_workspace_member(workspace_id)`).
- **Rationale**: Đảm bảo tính toàn vẹn dữ liệu ngay cả khi gọi trực tiếp qua Supabase REST/Realtime API.
- **Consequences**: Mọi thay đổi trạng thái quan trọng đều có kiểm chứng quyền và lưu vết vào `audit_logs`.
