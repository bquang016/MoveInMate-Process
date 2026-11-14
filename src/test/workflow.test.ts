import { describe, expect, it } from 'vitest';
import { SEED_TASKS } from '../data/seedData';
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

  it('enforces Owner/Reviewer permissions and blocks unauthorized or cross-workspace actors', () => {
    const taskTv1D3 = SEED_TASKS.find((t) => t.id === 'T-TV1-D3')!;

    expect(canMemberPerformAction(taskTv1D3, null, 'edit_task').allowed).toBe(
      false,
    );

    const crossWs = canMemberPerformAction(
      taskTv1D3,
      'TV1',
      'edit_task',
      '22222222-2222-4222-8222-222222222222',
    );
    expect(crossWs.allowed).toBe(false);
    expect(crossWs.reason).toContain('Cross-Workspace');

    expect(
      canMemberPerformAction(taskTv1D3, 'TV1', 'approve_review').allowed,
    ).toBe(false);
    expect(
      canMemberPerformAction(taskTv1D3, 'TV4', 'approve_review').allowed,
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
});
