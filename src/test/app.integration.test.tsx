import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';

describe('MoveInMate Tracker UI Smoke, RBAC Login & 7-Day Roadmap Flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts in Read-Only mode when unauthenticated and allows viewing any member roadmap', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: /MoveInMate AI — Team Progress Tracker/i,
      }),
    ).toBeInTheDocument();

    // Unauthenticated banner is displayed
    expect(
      screen.getByText(/Chế độ Xem \(Chưa đăng nhập tài khoản\)/i),
    ).toBeInTheDocument();

    // Default view shows TV1's Day 1..7 tasks in read-only mode
    expect(
      screen.getByText(/TV1 · Ngày 1: Chốt scope P0\/P1\/P2/i),
    ).toBeInTheDocument();

    // Switch roadmap filter tab to TV2 -> shows TV2's 7-day tasks
    const roadmapGroup = screen.getByRole('group', {
      name: /Chọn lộ trình thành viên/i,
    });
    fireEvent.click(within(roadmapGroup).getByRole('button', { name: /TV2/i }));

    expect(
      screen.getByText(/TV2 · Ngày 1: Chốt Nguồn Tài liệu, Corpus Manifest/i),
    ).toBeInTheDocument();
  });

  it('enforces member-specific permissions after login (TV2 can only interact with TV2 tasks)', async () => {
    render(<App />);

    // Open Login Modal
    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập ngay/i }));
    const loginDialog = screen.getByRole('dialog');

    // Select TV2 card (Đinh Trần Nguyên)
    fireEvent.click(
      within(loginDialog).getByRole('button', { name: /Đinh Trần Nguyên/i }),
    );

    const passInput = within(loginDialog).getByPlaceholderText(
      /Nhập mật khẩu của bạn/i,
    );
    fireEvent.change(passInput, { target: { value: 'dtnguyen@' } });

    fireEvent.click(
      within(loginDialog).getByRole('button', {
        name: /Đăng nhập & Mở khoá Tương tác/i,
      }),
    );

    // Wait for TV2's tasks to be unlocked
    const startTv2Day1Btn = await screen.findByRole('button', {
      name: /Bắt đầu làm Ngày 1/i,
    });
    expect(startTv2Day1Btn).not.toBeDisabled();

    // Now switch view to TV3's roadmap while logged in as TV2 -> TV3's tasks must be LOCKED!
    const roadmapGroup = screen.getByRole('group', {
      name: /Chọn lộ trình thành viên/i,
    });
    fireEvent.click(within(roadmapGroup).getByRole('button', { name: /TV3/i }));

    const startTv3Day1Btn = screen.getByRole('button', {
      name: /Bắt đầu làm Ngày 1/i,
    });
    expect(startTv3Day1Btn).toBeDisabled();
  });

  it('allows Admin (TV1 · Bùi Đăng Quang) to interact with all tasks and enforces Quality Gate before Done', async () => {
    render(<App />);

    // Log in as Admin TV1
    fireEvent.click(screen.getByRole('button', { name: /Đăng nhập ngay/i }));
    const loginDialog = screen.getByRole('dialog');
    const passInput = within(loginDialog).getByPlaceholderText(
      /Nhập mật khẩu của bạn/i,
    );
    fireEvent.change(passInput, { target: { value: '010605quang' } });
    fireEvent.click(
      within(loginDialog).getByRole('button', {
        name: /Đăng nhập & Mở khoá Tương tác/i,
      }),
    );

    const startDay3Btn = await screen.findByRole('button', {
      name: /Bắt đầu làm Ngày 3/i,
    });
    fireEvent.click(startDay3Btn);

    // Open TV1 Day 3 modal
    fireEvent.click(
      screen.getByText(
        /TV1 · Ngày 3: Hoàn thiện Profile\/Checklist API & Kết nối Frontend/i,
      ),
    );

    const dialog = screen.getByRole('dialog');
    const checkboxes = within(dialog).getAllByRole('checkbox');
    checkboxes.slice(0, 3).forEach((cb) => {
      fireEvent.click(cb);
    });

    // Try clicking Done before Reviewer approval -> blocked!
    const doneBtn = within(dialog).getByRole('button', {
      name: /Done \(Hoàn tất\)/i,
    });
    fireEvent.click(doneBtn);

    expect(
      within(dialog).getByText(
        /Không thể chuyển sang Done: Reviewer \(TV4\) chưa xác nhận phê duyệt/i,
      ),
    ).toBeInTheDocument();
  });

  it('displays the 4 real team members and renders the in-app User Guide tab', () => {
    render(<App />);

    expect(
      screen.getAllByText(/TV1 · Bùi Đăng Quang/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/TV2 · Đinh Trần Nguyên/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/TV3 · Trần Trọng Đức Tài/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/TV4 · Nguyễn Tuấn Anh/i).length,
    ).toBeGreaterThan(0);

    const guideTab = screen.getByRole('tab', { name: /Hướng dẫn Sử dụng/i });
    fireEvent.click(guideTab);

    expect(
      screen.getByRole('heading', {
        name: /Hướng dẫn Sử dụng Chi tiết — MoveInMate Team Progress Tracker/i,
      }),
    ).toBeInTheDocument();
  });
});
