import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';

describe('MoveInMate Tracker UI Smoke & 7-Day Roadmap Integration Flow', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders 7-day roadmap starting at 0% and switches task lists when changing member role', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', {
        name: /MoveInMate AI — Team Progress Tracker/i,
      }),
    ).toBeInTheDocument();

    // Default active member is TV1 -> shows TV1's Day 1..7 tasks
    expect(
      screen.getByText(/TV1 · Ngày 1: Chốt scope P0\/P1\/P2/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/TV1 · Ngày 2: Xây dựng Onboarding Agent Graph/i),
    ).toBeInTheDocument();

    // Switch role to TV2 in top switcher -> immediately switches to TV2's 7-day tasks
    const sessionGroup = screen.getByRole('group', {
      name: /Chọn thành viên đang đăng nhập/i,
    });
    fireEvent.click(within(sessionGroup).getByRole('button', { name: /TV2/i }));

    expect(
      screen.getByText(/TV2 · Ngày 1: Chốt Nguồn Tài liệu, Corpus Manifest/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/TV2 · Ngày 2: Xây dựng 2 Chiến lược Chunking/i),
    ).toBeInTheDocument();
  });

  it('allows a member to work ahead on Day 2/3 immediately and enforces Reviewer gate before Done', () => {
    render(<App />);

    // TV1 decides to start Day 3 early (working ahead!)
    const startDay3Btn = screen.getByRole('button', {
      name: /Bắt đầu làm Ngày 3/i,
    });
    fireEvent.click(startDay3Btn);

    // Open TV1 Day 3 modal (Owner=TV1, Reviewer=TV4)
    fireEvent.click(
      screen.getByText(
        /TV1 · Ngày 3: Hoàn thiện Profile\/Checklist API & Kết nối Frontend/i,
      ),
    );

    const dialog = screen.getByRole('dialog');
    // Tick all 3 mandatory criteria inside modal
    const checkboxes = within(dialog).getAllByRole('checkbox');
    checkboxes.slice(0, 3).forEach((cb) => {
      fireEvent.click(cb);
    });

    // Try clicking Done before Reviewer TV4 approves -> blocked!
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

  it('activates RLS Unauthorized protection when switching to outside user', () => {
    render(<App />);

    const sessionGroup = screen.getByRole('group', {
      name: /Chọn thành viên đang đăng nhập/i,
    });
    const outsideBtn = within(sessionGroup).getByRole('button', {
      name: /Khách ngoài/i,
    });
    fireEvent.click(outsideBtn);

    expect(
      screen.getByText(
        /Chế độ Kiểm thử Bảo mật \(Unauthorized \/ Cross-Workspace User\)/i,
      ),
    ).toBeInTheDocument();

    const addTaskBtn = screen.getByRole('button', { name: /Thêm Task mới/i });
    expect(addTaskBtn).toBeDisabled();
  });

  it('displays the 4 real team members and renders the in-app User Guide tab', () => {
    render(<App />);

    expect(screen.getAllByText(/TV1 · Bùi Đăng Quang/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TV2 · Đinh Trần Nguyên/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TV3 · Trần Trọng Đức Tài/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/TV4 · Nguyễn Tuấn Anh/i).length).toBeGreaterThan(0);

    const guideTab = screen.getByRole('tab', { name: /Hướng dẫn Sử dụng/i });
    fireEvent.click(guideTab);

    expect(
      screen.getByRole('heading', {
        name: /Hướng dẫn Sử dụng Chi tiết — MoveInMate Team Progress Tracker/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('buidangquangmtp@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('nguyentrandinh.tn@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('trongductai2005@gmail.com')).toBeInTheDocument();
    expect(screen.getByText('capntryisreal@gmail.com')).toBeInTheDocument();
  });
});
