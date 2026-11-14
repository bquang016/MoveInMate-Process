import React, { useState } from 'react';
import {
  CheckCircle2,
  Database,
  KeyRound,
  Lock,
  LogIn,
  ShieldCheck,
  Terminal,
  X,
} from 'lucide-react';
import type { SupabaseEnvConfig } from '../lib/supabase';
import type { MemberCode, TeamMember } from '../types/tracker';

interface SupabaseSetupModalProps {
  envConfig: SupabaseEnvConfig;
  members: TeamMember[];
  currentMember: MemberCode | null;
  authEmail: string | null;
  onClose: () => void;
  onSelectDemoMember: (code: MemberCode | null) => void;
  onSupabaseSignIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; message: string }>;
  onSupabaseSignOut: () => Promise<void>;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({
  envConfig,
  members,
  currentMember,
  authEmail,
  onClose,
  onSelectDemoMember,
  onSupabaseSignIn,
  onSupabaseSignOut,
}) => {
  const [email, setEmail] = useState(
    members[0]?.email || 'buidangquangmtp@gmail.com',
  );
  const [password, setPassword] = useState('');
  const [authStatus, setAuthStatus] = useState<{
    type: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setAuthStatus(null);
    try {
      const res = await onSupabaseSignIn(email.trim(), password);
      setAuthStatus({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-setup-modal-title"
    >
      <div className="modal-panel modal-panel-md">
        <header className="modal-header">
          <div>
            <span className="badge badge-code">
              {envConfig.isConfigured
                ? 'Supabase Connected'
                : 'Demo Mode (Safe Fallback)'}
            </span>
            <h2 id="auth-setup-modal-title" className="modal-title">
              Xác thực Thành viên & Cấu hình Supabase RLS / Realtime
            </h2>
          </div>
          <button
            type="button"
            className="icon-close-btn"
            onClick={onClose}
            aria-label="Đóng cửa sổ cấu hình"
          >
            <X size={20} />
          </button>
        </header>

        <div className="modal-body">
          {/* Section 1: Supabase Live Auth (when env configured) OR Demo Role Switcher */}
          {envConfig.isConfigured ? (
            <section className="detail-section">
              <h3>
                <KeyRound size={16} /> Đăng nhập bằng Supabase Auth
              </h3>
              <p className="muted-text">
                Ứng dụng sử dụng trực tiếp Supabase Auth (không tự lưu mật khẩu
                riêng). Chỉ email nằm trong bảng <code>team_members</code> của
                workspace mới vượt qua được Row Level Security (RLS).
              </p>

              {authStatus && (
                <div className={`alert-banner alert-${authStatus.type}`}>
                  <span>{authStatus.text}</span>
                </div>
              )}

              {authEmail ? (
                <div className="info-box">
                  <p>
                    Đang đăng nhập với email: <strong>{authEmail}</strong> (Vai
                    trò: <strong>{currentMember || 'Unauthorized'}</strong>)
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void onSupabaseSignOut()}
                  >
                    Đăng xuất phiên Supabase
                  </button>
                </div>
              ) : (
                <form className="metadata-form" onSubmit={handleLoginSubmit}>
                  <label>
                    <span>Email thành viên (TV1–TV4)</span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="buidangquangmtp@gmail.com"
                    />
                  </label>
                  <label>
                    <span>Mật khẩu tài khoản thành viên</span>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </label>
                  <div className="quick-email-pills">
                    {members.map((m) => (
                      <button
                        key={m.memberCode}
                        type="button"
                        className="chip-toggle"
                        onClick={() => setEmail(m.email)}
                      >
                        Chọn {m.displayName} ({m.email})
                      </button>
                    ))}
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn btn-primary"
                  >
                    <LogIn size={16} />{' '}
                    {submitting
                      ? 'Đang xác thực...'
                      : 'Đăng nhập Supabase Auth'}
                  </button>
                </form>
              )}
            </section>
          ) : (
            <section className="detail-section">
              <h3>
                <ShieldCheck size={16} /> Chuyển đổi Phiên Thành viên trong Demo
                Mode
              </h3>
              <p className="muted-text">
                Hiện tại tệp <code>.env</code> đang để trống theo thiết kế an
                toàn. Bạn có thể chuyển đổi nhanh giữa 4 thành viên{' '}
                <strong>TV1–TV4</strong> hoặc thử chế độ{' '}
                <strong>Khách ngoài (Unauthorized RLS)</strong> để kiểm thử phân
                quyền Owner / Reviewer.
              </p>
              <div className="demo-member-cards">
                {members.map((m) => (
                  <button
                    key={m.memberCode}
                    type="button"
                    onClick={() => {
                      onSelectDemoMember(m.memberCode);
                      onClose();
                    }}
                    className={`demo-role-card ${
                      currentMember === m.memberCode ? 'active' : ''
                    }`}
                  >
                    <div className="demo-role-top">
                      <strong>{m.displayName}</strong>
                      {currentMember === m.memberCode && (
                        <CheckCircle2 size={16} />
                      )}
                    </div>
                    <small>{m.email}</small>
                    <span className="role-chip">{m.crossRole}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    onSelectDemoMember(null);
                    onClose();
                  }}
                  className={`demo-role-card unauthorized-card ${
                    currentMember === null ? 'active' : ''
                  }`}
                >
                  <div className="demo-role-top">
                    <strong>
                      <Lock size={14} /> Khách ngoài / Cross-Workspace
                    </strong>
                    {currentMember === null && <CheckCircle2 size={16} />}
                  </div>
                  <small>outside.user@external.local</small>
                  <span className="role-chip">
                    Kiểm thử chặn quyền sửa & RLS
                  </span>
                </button>
              </div>
            </section>
          )}

          {/* Section 2: SQL & Environment Setup Checklist */}
          <section className="detail-section">
            <h3>
              <Database size={16} /> Hướng dẫn kết nối Supabase thật (3 bước)
            </h3>
            <ol className="setup-steps-list">
              <li>
                <strong>Chạy SQL Migration & Seed:</strong> Mở Supabase SQL
                Editor và chạy lần lượt{' '}
                <code>supabase/migrations/20261114000001_schema_and_rls.sql</code>{' '}
                và <code>supabase/seed.sql</code>.
              </li>
              <li>
                <strong>Tạo 4 tài khoản Auth:</strong> Trong Supabase Dashboard
                → Authentication → Users, tạo 4 user khớp với email trong bảng{' '}
                <code>team_members</code> (hoặc cập nhật email thật của 4 bạn).
              </li>
              <li>
                <strong>Điền tệp .env (đã nằm trong .gitignore):</strong>
                <pre className="code-snippet">
                  {`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
VITE_DEFAULT_WORKSPACE_SLUG=moveinmate-vhr16`}
                </pre>
              </li>
            </ol>
            <div className="rls-summary-badge">
              <Terminal size={15} />
              <span>
                <strong>Bảo mật RLS:</strong> Tất cả 7 bảng đều bật{' '}
                <code>ENABLE ROW LEVEL SECURITY</code>, hàm{' '}
                <code>public.is_workspace_member(workspace_id)</code> ngăn người
                ngoài và ngăn truy cập chéo giữa các workspace.
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

