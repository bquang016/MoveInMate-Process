import { describe, expect, it } from 'vitest';
import { SEED_TASKS } from '../data/seedData';
import {
  buildStatusChangeDiscordPayload,
  isStatusRollback,
} from '../lib/discord';
import { resolveSupabaseEnv } from '../lib/supabase';
import {
  calculateMemberProgress,
  calculateProjectSummary,
  calculateTaskProgress,
  canMemberPerformAction,
  isTaskOverdue,
  validateStatusTransition,
} from '../lib/workflow';
import type { TrackerTask } from '../types/tracker';

describe('MoveInMate Workflow, Progress & RLS Permission Logic (28 Daily Tasks)', () => {
  it('seeds 28 daily tasks (7 days × 4 members) starting at 0% Todo', () => {
    expect(SEED_TASKS.length).toBe(28);

    const summary = calculateProjectSummary(
      SEED_TASKS,
      new Date('2026-11-14T09:00:00Z'),
    );
    expect(summary.totalTasks).toBe(28);
    expect(summary.todoCount).toBe(28);
    expect(summary.doneCount).toBe(0);
    expect(summary.overallPercent).toBe(0);

    for (const code of ['TV1', 'TV2', 'TV3', 'TV4'] as const) {
      const memberStat = calculateMemberProgress(SEED_TASKS, code);
      expect(memberStat.totalTasks).toBe(7); // Ngày 1 -> Ngày 7
      expect(memberStat.completionPercent).toBe(0);
    }
  });

  it('calculates task checklist progress accurately as criteria are ticked', () => {
    const day1Task = SEED_TASKS.find((t) => t.id === 'T-TV1-D1')!;
    const initialMetrics = calculateTaskProgress(day1Task);
    expect(initialMetrics.totalCount).toBe(4);
    expect(initialMetrics.completedCount).toBe(0);
    expect(initialMetrics.percent).toBe(0);

    const halfDoneTask: TrackerTask = {
      ...day1Task,
      criteria: day1Task.criteria.map((c, idx) =>
        idx < 2 ? { ...c, isCompleted: true } : c,
      ),
    };
    const halfMetrics = calculateTaskProgress(halfDoneTask);
    expect(halfMetrics.completedCount).toBe(2);
    expect(halfMetrics.percent).toBe(50);
    expect(halfMetrics.allMandatoryCompleted).toBe(false);
  });

  it('requires confirmation when moving a task to Review with incomplete mandatory criteria', () => {
    const taskTv2D1 = SEED_TASKS.find((t) => t.id === 'T-TV2-D1')!;
    const withoutConfirm = validateStatusTransition(taskTv2D1, 'review', 'TV2');
    expect(withoutConfirm.allowed).toBe(false);
    expect(withoutConfirm.requiresConfirmation).toBe(true);

    const withConfirm = validateStatusTransition(taskTv2D1, 'review', 'TV2', {
      confirmIncompleteForReview: true,
    });
    expect(withConfirm.allowed).toBe(true);
    expect(withConfirm.requiresConfirmation).toBe(false);
  });

  it('blocks moving a task to Done if mandatory criteria are incomplete OR reviewer has not approved', () => {
    const baseTask = SEED_TASKS.find((t) => t.id === 'T-TV1-D3')!; // Owner=TV1, Reviewer=TV4

    // 1. Incomplete mandatory criteria
    const blockedByCriteria = validateStatusTransition(baseTask, 'done', 'TV1');
    expect(blockedByCriteria.allowed).toBe(false);
    expect(blockedByCriteria.reason).toContain('tiêu chí đầu ra bắt buộc');

    // 2. All mandatory criteria completed, but reviewerApproved is false
    const allCriteriaDone: TrackerTask = {
      ...baseTask,
      status: 'review',
      criteria: baseTask.criteria.map((c) => ({ ...c, isCompleted: true })),
    };
    const blockedByReviewer = validateStatusTransition(
      allCriteriaDone,
      'done',
      'TV1',
    );
    expect(blockedByReviewer.allowed).toBe(false);
    expect(blockedByReviewer.reason).toContain('Reviewer (TV4) chưa xác nhận');

    // 3. Reviewer TV4 approved + all mandatory criteria completed -> allowed!
    const approvedTask: TrackerTask = {
      ...allCriteriaDone,
      reviewerApproved: true,
      reviewerApprovedBy: 'TV4',
    };
    const allowedDone = validateStatusTransition(approvedTask, 'done', 'TV1');
    expect(allowedDone.allowed).toBe(true);
  });

  it('enforces strict per-member ownership, Reviewer permissions, and full Admin (TV1) access', () => {
    const taskTv2D3 = SEED_TASKS.find((t) => t.id === 'T-TV2-D3')!; // Owner=TV2, Reviewer=TV3
    const taskTv1D3 = SEED_TASKS.find((t) => t.id === 'T-TV1-D3')!; // Owner=TV1, Reviewer=TV4

    // 1. Unauthenticated visitor cannot edit
    expect(canMemberPerformAction(taskTv2D3, null, 'edit_task').allowed).toBe(
      false,
    );

    // 2. Cross-workspace is blocked
    const crossWs = canMemberPerformAction(
      taskTv1D3,
      'TV1',
      'edit_task',
      '22222222-2222-4222-8222-222222222222',
    );
    expect(crossWs.allowed).toBe(false);
    expect(crossWs.reason).toContain('Cross-Workspace');

    // 3. Regular member (TV3, TV4) CANNOT edit or tick TV2's task
    expect(
      canMemberPerformAction(taskTv2D3, 'TV3', 'toggle_criterion').allowed,
    ).toBe(false);
    expect(canMemberPerformAction(taskTv2D3, 'TV4', 'edit_task').allowed).toBe(
      false,
    );

    // 4. Owner (TV2) CAN edit and tick TV2's own task, but CANNOT approve review on own task
    expect(
      canMemberPerformAction(taskTv2D3, 'TV2', 'toggle_criterion').allowed,
    ).toBe(true);
    expect(
      canMemberPerformAction(taskTv2D3, 'TV2', 'approve_review').allowed,
    ).toBe(false);

    // 5. Assigned Reviewer CAN approve review on TV2's Day 3 task
    expect(
      canMemberPerformAction(
        taskTv2D3,
        taskTv2D3.reviewerCode,
        'approve_review',
      ).allowed,
    ).toBe(true);

    // 6. Admin (TV1) CAN edit, tick, and approve review on ANY member's task
    expect(
      canMemberPerformAction(taskTv2D3, 'TV1', 'toggle_criterion').allowed,
    ).toBe(true);
    expect(
      canMemberPerformAction(taskTv2D3, 'TV1', 'approve_review').allowed,
    ).toBe(true);
  });

  it('detects overdue tasks only when status is not done', () => {
    const task = SEED_TASKS[0];
    const futureDate = new Date('2026-11-30T10:00:00Z');
    expect(isTaskOverdue(task, futureDate)).toBe(true);
    expect(isTaskOverdue({ ...task, status: 'done' }, futureDate)).toBe(false);
  });

  it('safely resolves empty environment variables into Demo Mode without crashing', () => {
    const emptyConfig = resolveSupabaseEnv({
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
    });
    expect(emptyConfig.isConfigured).toBe(false);
  });

  it('builds custom Discord Webhook embeds for forward transitions and rollback/revert transitions', () => {
    const taskTv1D1 = SEED_TASKS.find((t) => t.id === 'T-TV1-D1')!;

    // Forward: todo -> in_progress
    expect(isStatusRollback('todo', 'in_progress')).toBe(false);
    const startPayload = buildStatusChangeDiscordPayload({
      task: { ...taskTv1D1, status: 'in_progress' },
      prevStatus: 'todo',
      nextStatus: 'in_progress',
      actorCode: 'TV1',
      actorName: 'TV1 · Bùi Đăng Quang',
      ownerName: 'TV1 · Bùi Đăng Quang',
      reviewerName: 'TV2 · Đinh Trần Nguyên',
    });
    expect(startPayload.embeds[0].title).toContain('[Bắt đầu làm]');

    // Forward: in_progress -> review
    const reviewPayload = buildStatusChangeDiscordPayload({
      task: { ...taskTv1D1, status: 'review' },
      prevStatus: 'in_progress',
      nextStatus: 'review',
      actorCode: 'TV1',
      actorName: 'TV1 · Bùi Đăng Quang',
      ownerName: 'TV1 · Bùi Đăng Quang',
      reviewerName: 'TV2 · Đinh Trần Nguyên',
    });
    expect(reviewPayload.embeds[0].title).toContain('[Cần Review]');
    expect(reviewPayload.content).toContain('TV2 · Đinh Trần Nguyên');

    // Rollback / Revert: in_progress -> todo (lỡ bấm nhầm chuyển về bình thường)
    expect(isStatusRollback('in_progress', 'todo')).toBe(true);
    const revertTodoPayload = buildStatusChangeDiscordPayload({
      task: { ...taskTv1D1, status: 'todo' },
      prevStatus: 'in_progress',
      nextStatus: 'todo',
      actorCode: 'TV1',
      actorName: 'TV1 · Bùi Đăng Quang',
      ownerName: 'TV1 · Bùi Đăng Quang',
      reviewerName: 'TV2 · Đinh Trần Nguyên',
    });
    expect(revertTodoPayload.embeds[0].title).toContain('[Hoàn tác về Todo]');

    // Rollback / Revert: review -> in_progress (thu hồi yêu cầu review)
    expect(isStatusRollback('review', 'in_progress')).toBe(true);
    const recallReviewPayload = buildStatusChangeDiscordPayload({
      task: { ...taskTv1D1, status: 'in_progress' },
      prevStatus: 'review',
      nextStatus: 'in_progress',
      actorCode: 'TV1',
      actorName: 'TV1 · Bùi Đăng Quang',
      ownerName: 'TV1 · Bùi Đăng Quang',
      reviewerName: 'TV2 · Đinh Trần Nguyên',
    });
    expect(recallReviewPayload.embeds[0].title).toContain(
      '[Thu hồi Yêu cầu Review]',
    );
  });
});
