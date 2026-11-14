import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  Crown,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  UserCheck,
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
  onSupabaseSignIn: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; message: string }>;
  onSupabaseSignOut: () => Promise<void>;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({
  members,
  currentMember,
  authEmail,
  onClose,
  onSupabaseSignIn,
  onSupabaseSignOut,
}) => {
  const defaultMember =
    members.find((m) => m.memberCode === currentMember) ?? members[0];
  const [selectedCode, setSelectedCode] = useState<MemberCode>(
    defaultMember?.memberCode || 'TV1',
  );
  const [email, setEmail] = useState(
    defaultMember?.email || 'buidangquangmtp@gmail.com',
  );
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authStatus, setAuthStatus] = useState<{
    type: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectMemberCard = (member: TeamMember) => {
    setSelectedCode(member.memberCode);
    setEmail(member.email);
    setAuthStatus(null);
    window.setTimeout(() => {
      passwordInputRef.current?.focus();
    }, 30);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setAuthStatus({
        type: 'error',
        text: 'Vui lòng nhập đầy đủ email và mật khẩu của thành viên.',
      });
      return;
    }
    setSubmitting(true);
    setAuthStatus(null);
    try {
      const res = await onSupabaseSignIn(email.trim(), password);
      setAuthStatus({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
      if (res.ok) {
        setPassword('');
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const activeMemberObj = members.find((m) => m.memberCode === currentMember);

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-setup-modal-title"
    >
      <div className="modal-panel auth-modal-modern">
        {/* Modern Dark Gradient Header */}
        <header className="auth-modal-hero">
          <div className="auth-hero-left">
            <div className="auth-hero-icon">
              <KeyRound size={22} />
            </div>
            <div>
              <span className="auth-eyebrow">
                MoveInMate AI · Phân quyền Thành viên & Admin
              </span>
              <h2 id="auth-setup-modal-title" className="auth-hero-title">
                Đăng nhập Tài khoản Thành viên
              </h2>
              <p className="auth-hero-subtitle">
                Mỗi thành viên chỉ tương tác được trên phần công việc của mình.
                Tài khoản Admin (TV1) có toàn quyền điều phối cả nhóm.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="auth-close-btn"
            onClick={onClose}
            aria-label="Đóng cửa sổ đăng nhập"
          >
            <X size={20} />
          </button>
        </header>

        <div className="auth-modal-body">
          {/* Active Session Banner if already logged in */}
          {currentMember && activeMemberObj && (
            <div
              className="auth-current-session"
              style={
                {
                  '--member-color': activeMemberObj.colorHex,
                } as React.CSSProperties
              }
            >
              <div className="auth-session-info">
                <div className="auth-session-avatar">
                  {activeMemberObj.avatarLabel}
                </div>
                <div>
                  <div className="auth-session-name-row">
                    <strong>{activeMemberObj.displayName}</strong>
                    {currentMember === 'TV1' ? (
                      <span className="auth-role-badge badge-admin">
                        <Crown size={12} /> ADMIN · Toàn quyền
                      </span>
                    ) : (
                      <span className="auth-role-badge badge-member">
                        <UserCheck size={12} /> Quyền Owner {currentMember} &
                        Reviewer
                      </span>
                    )}
                  </div>
                  <small>{authEmail || activeMemberObj.email}</small>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-danger-outline btn-sm"
                onClick={() => void onSupabaseSignOut()}
              >
                <LogOut size={14} /> Đăng xuất
              </button>
            </div>
          )}

          {/* Step 1: Visual 2x2 Member Account Picker */}
          <div className="auth-step-block">
            <div className="auth-step-label">
              <span>1. Chọn tài khoản thành viên của bạn</span>
              <small>Bấm vào thẻ để tự động điền Email</small>
            </div>

            <div className="auth-member-grid">
              {members.map((m) => {
                const isSelected =
                  email.toLowerCase() === m.email.toLowerCase() ||
                  selectedCode === m.memberCode;
                const isCurrentLogged = currentMember === m.memberCode;
                const isAdmin = m.memberCode === 'TV1';

                return (
                  <button
                    key={m.memberCode}
                    type="button"
                    onClick={() => handleSelectMemberCard(m)}
                    style={
                      { '--member-color': m.colorHex } as React.CSSProperties
                    }
                    className={`auth-account-card ${
                      isSelected ? 'selected' : ''
                    }`}
                  >
                    <div className="auth-card-top">
                      <span className="auth-card-avatar">{m.memberCode}</span>
                      <div className="auth-card-badges">
                        {isAdmin ? (
                          <span className="auth-mini-pill pill-admin">
                            <Crown size={11} /> Admin & Lead
                          </span>
                        ) : (
                          <span className="auth-mini-pill pill-slice">
                            {m.sliceName.split('&')[0].trim()}
                          </span>
                        )}
                        {isCurrentLogged && (
                          <span className="auth-mini-pill pill-online">
                            <CheckCircle2 size={11} /> Đang dùng
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="auth-card-name">
                      {m.displayName.replace(/^TV\d\s*·\s*/, '')}
                    </div>
                    <div className="auth-card-email">{m.email}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Password & Sign-In Form */}
          <form className="auth-login-form" onSubmit={handleLoginSubmit}>
            <div className="auth-step-label">
              <span>2. Nhập mật khẩu xác thực</span>
              <small>Xác thực trực tiếp qua Supabase Auth</small>
            </div>

            {authStatus && (
              <div className={`alert-banner alert-${authStatus.type}`}>
                <span>{authStatus.text}</span>
              </div>
            )}

            <div className="auth-inputs-row">
              <label className="auth-field">
                <span>Email đăng nhập</span>
                <div className="auth-input-box">
                  <Mail size={16} className="auth-field-icon" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="buidangquangmtp@gmail.com"
                  />
                </div>
              </label>

              <label className="auth-field">
                <span>Mật khẩu</span>
                <div className="auth-input-box">
                  <Lock size={16} className="auth-field-icon" />
                  <input
                    ref={passwordInputRef}
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Nhập mật khẩu của bạn..."
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={
                      showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'
                    }
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            </div>

            <div className="auth-submit-row">
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary auth-submit-btn"
              >
                <LogIn size={16} />{' '}
                {submitting
                  ? 'Đang xác thực tài khoản...'
                  : 'Đăng nhập & Mở khoá Tương tác'}
              </button>
            </div>
          </form>

          {/* Role Permission Rules Box */}
          <div className="auth-rbac-box">
            <div className="auth-rbac-item">
              <Crown size={16} className="rbac-icon-admin" />
              <div>
                <strong>Admin (TV1 · Bùi Đăng Quang):</strong> Toàn quyền tương
                tác, tick checklist, đổi trạng thái, duyệt Review và quản trị
                tất cả 28 task của cả 4 thành viên.
              </div>
            </div>
            <div className="auth-rbac-item">
              <ShieldCheck size={16} className="rbac-icon-member" />
              <div>
                <strong>Thành viên (TV2, TV3, TV4):</strong> Chỉ tương tác được
                trên các task của riêng mình (Owner) và bấm Approve trên các
                task mình được giao làm Reviewer. Các phần khác ở chế độ Chỉ
                xem.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
