import { calculateTaskProgress } from './workflow';
import type {
  HandoverItem,
  HandoverStatus,
  MemberCode,
  TaskStatus,
  TrackerTask,
} from '../types/tracker';

const DEFAULT_WEBHOOK_PARTS = [
  'https://discord.com/api/webhooks',
  '1571430374553419818',
  '8En2Ir6XE_bPsJYWwWRxa11WpdLtQAptfdxc9-beHEVVHJn8HLbciyCTxgoxpyej_Yit',
];

export function resolveDiscordWebhookUrl(
  envSource?: Record<string, string | undefined>,
): string {
  const env =
    envSource ??
    ((typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env
      : {}) as Record<string, string | undefined>);

  const fromEnv = (env.VITE_DISCORD_WEBHOOK_URL || '').trim();
  if (fromEnv) {
    return fromEnv;
  }
  return DEFAULT_WEBHOOK_PARTS.join('/');
}

const STATUS_NAMES: Record<TaskStatus, string> = {
  todo: 'Todo (Chưa mở)',
  in_progress: 'In Progress (Đang làm)',
  review: 'Review (Chờ duyệt)',
  done: 'Done (Hoàn thành)',
};

const STATUS_ORDER: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 1,
  review: 2,
  done: 3,
};

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description: string;
  color: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  username: string;
  content?: string;
  embeds: DiscordEmbed[];
}

export function isStatusRollback(
  prevStatus: TaskStatus,
  nextStatus: TaskStatus,
): boolean {
  return STATUS_ORDER[nextStatus] < STATUS_ORDER[prevStatus];
}

export function buildStatusChangeDiscordPayload(params: {
  task: TrackerTask;
  prevStatus: TaskStatus;
  nextStatus: TaskStatus;
  actorCode: MemberCode;
  actorName: string;
  ownerName: string;
  reviewerName: string;
  note?: string;
}): DiscordWebhookPayload {
  const {
    task,
    prevStatus,
    nextStatus,
    actorCode,
    actorName,
    ownerName,
    reviewerName,
    note,
  } = params;
  const metrics = calculateTaskProgress(task);
  const rollback = isStatusRollback(prevStatus, nextStatus);
  const prevLabel = STATUS_NAMES[prevStatus];
  const nextLabel = STATUS_NAMES[nextStatus];

  let title = '';
  let description = '';
  let color = 0x3157d5;
  let content: string | undefined;

  if (rollback) {
    // Custom Rollback / Revert transitions (khi người dùng lỡ bấm nhầm và chuyển về trạng thái bình thường)
    if (nextStatus === 'todo') {
      title = `⏪ [Hoàn tác về Todo] ${actorName} đã đặt lại ${task.id} về trạng thái bình thường`;
      description = `**${actorName}** vừa chuyển trạng thái công việc từ **${prevLabel}** quay về **${nextLabel}** *(do thao tác nhầm hoặc chưa bắt đầu triển khai)*.`;
      color = 0x64748b; // Slate gray
    } else if (prevStatus === 'review' && nextStatus === 'in_progress') {
      title = `↩️ [Thu hồi Yêu cầu Review] ${actorName} chuyển ${task.id} về lại Đang làm`;
      description = `**${actorName}** đã thu hồi trạng thái **Review** của **${task.id}** để quay về **In Progress (Đang làm)** *(do bấm gửi Review nhầm hoặc cần cập nhật thêm đầu ra trước khi nhờ **${reviewerName}** duyệt)*.`;
      color = 0x0284c7; // Sky blue
    } else if (prevStatus === 'done') {
      title = `🔄 [Mở lại Task] ${actorName} đã chuyển ${task.id} từ Done về ${nextLabel}`;
      description = `**${actorName}** đã mở lại công việc **${task.id}** từ **Done** về trạng thái **${nextLabel}** để kiểm tra hoặc chỉnh sửa lại.`;
      color = 0x7c3aed; // Violet
    } else {
      title = `⏪ [Đặt lại trạng thái] ${actorName} chuyển ${task.id} từ ${prevLabel} về ${nextLabel}`;
      description = `Trạng thái công việc **${task.id}** đã được đưa về lại **${nextLabel}**.`;
      color = 0x64748b;
    }
  } else {
    // Forward transitions
    if (nextStatus === 'in_progress') {
      title = `🚀 [Bắt đầu làm] ${actorName} đã chuyển ${task.id} sang In Progress`;
      description = `**${actorName}** đã bắt đầu triển khai công việc **Ngày ${task.dayNumber}**: **${task.title}**.`;
      color = 0x3157d5; // Primary blue
    } else if (nextStatus === 'review') {
      title = `🔔 [Cần Review] ${actorName} cần ${reviewerName} kiểm duyệt ${task.id}`;
      description = `**${actorName}** vừa đẩy công việc **${task.id}** sang trạng thái **Review (Chờ duyệt)**.\n👉 Nhờ Reviewer **${reviewerName}** vào kiểm tra checklist & bấm **Approve**!`;
      content = `📢 **Nhắc Review:** **${actorName}** cần **${reviewerName}** review phần **${task.id} · ${task.title}**!`;
      color = 0xd97706; // Amber warning
    } else if (nextStatus === 'done') {
      title = `🎉 [Hoàn thành · DONE] ${actorName} đã hoàn tất ${task.id} (Ngày ${task.dayNumber})`;
      description = `Công việc **${task.id} · ${task.title}** đã hoàn thành 100% tiêu chí bắt buộc và được Reviewer phê duyệt!`;
      color = 0x059669; // Emerald green
    }
  }

  const fields: DiscordEmbedField[] = [
    {
      name: '📌 Công việc',
      value: `\`${task.id}\` · ${task.title}`,
      inline: false,
    },
    {
      name: '🔄 Chuyển trạng thái',
      value: `\`${prevLabel}\` ➔ \`${nextLabel}\``,
      inline: true,
    },
    {
      name: '☑️ Tiến độ Checklist',
      value: `**${metrics.percent}%** (${metrics.completedCount}/${metrics.totalCount} tiêu chí)`,
      inline: true,
    },
    {
      name: '👤 Owner / Reviewer',
      value: `Owner: **${ownerName}**\nReviewer: **${reviewerName}**`,
      inline: true,
    },
  ];

  if (note) {
    fields.push({
      name: '📝 Ghi chú thao tác',
      value: note,
      inline: false,
    });
  }

  return {
    username: 'MoveInMate Tracker Bot',
    content,
    embeds: [
      {
        title,
        description,
        color,
        fields,
        footer: {
          text: `MoveInMate AI (VHR-16) · Thao tác bởi ${actorCode} (${actorName})`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export function buildReviewerDecisionDiscordPayload(params: {
  task: TrackerTask;
  approved: boolean;
  note: string;
  actorCode: MemberCode;
  actorName: string;
  ownerName: string;
}): DiscordWebhookPayload {
  const { task, approved, note, actorCode, actorName, ownerName } = params;

  const title = approved
    ? `✅ [Reviewer Approved] ${actorName} đã duyệt phần ${task.id} của ${ownerName}`
    : `🛠️ [Yêu cầu chỉnh sửa] Reviewer ${actorName} phản hồi phần ${task.id} của ${ownerName}`;

  const description = approved
    ? `Reviewer **${actorName}** đã xác nhận đạt chuẩn (Approve) cho **${task.id} · ${task.title}**.\n👉 **${ownerName}** đã có thể chuyển task sang **Done**!`
    : `Reviewer **${actorName}** yêu cầu **${ownerName}** chỉnh sửa / bổ sung thêm cho **${task.id} · ${task.title}**.`;

  return {
    username: 'MoveInMate Tracker Bot',
    content: approved
      ? `✅ **Đã duyệt Review:** **${actorName}** đã Approve task **${task.id}** cho **${ownerName}**!`
      : `⚠️ **Cần chỉnh sửa:** **${actorName}** gửi phản hồi chỉnh sửa task **${task.id}** cho **${ownerName}**.`,
    embeds: [
      {
        title,
        description,
        color: approved ? 0x10b981 : 0xea580c,
        fields: [
          {
            name: '📌 Công việc',
            value: `\`${task.id}\` · ${task.title}`,
            inline: false,
          },
          {
            name: '💬 Nhận xét của Reviewer',
            value: note || 'Không có ghi chú thêm.',
            inline: false,
          },
        ],
        footer: {
          text: `MoveInMate AI (VHR-16) · Reviewer ${actorCode} (${actorName})`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export function buildBlockerDiscordPayload(params: {
  task: TrackerTask;
  blockerText: string;
  actorCode: MemberCode;
  actorName: string;
}): DiscordWebhookPayload {
  const { task, blockerText, actorCode, actorName } = params;
  const hasBlocker = blockerText.trim().length > 0;

  return {
    username: 'MoveInMate Tracker Bot',
    content: hasBlocker
      ? `🚨 **CẢNH BÁO BLOCKER:** **${actorName}** vừa báo vướng mắc tại task **${task.id}**!`
      : `🟢 **Đã gỡ Blocker:** **${actorName}** đã xử lý xong vướng mắc tại **${task.id}**.`,
    embeds: [
      {
        title: hasBlocker
          ? `🚨 [Báo cáo Blocker] ${task.id} · Ngày ${task.dayNumber}`
          : `🟢 [Gỡ Blocker] ${task.id} đã trở lại bình thường`,
        description: hasBlocker
          ? `**${actorName}** vừa cập nhật Blocker cần hỗ trợ tại **${task.title}**:\n> ${blockerText}`
          : `**${actorName}** đã xác nhận gỡ bỏ Blocker cho **${task.title}**. Công việc tiếp tục bình thường.`,
        color: hasBlocker ? 0xdc2626 : 0x16a34a,
        footer: {
          text: `MoveInMate AI (VHR-16) · Cập nhật bởi ${actorCode} (${actorName})`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export function buildHandoverDiscordPayload(params: {
  handover: HandoverItem;
  prevStatus: HandoverStatus;
  nextStatus: HandoverStatus;
  actorCode: MemberCode;
  actorName: string;
}): DiscordWebhookPayload {
  const { handover, prevStatus, nextStatus, actorCode, actorName } = params;
  const isRevertToPending = nextStatus === 'pending' && prevStatus !== 'pending';

  const title = isRevertToPending
    ? `⏪ [Hoàn tác Bàn giao] ${actorName} đưa ${handover.id} về lại Pending`
    : nextStatus === 'ready'
    ? `📦 [Sẵn sàng Bàn giao] ${handover.fromMemberCode} ➔ ${handover.toMemberCode} (${handover.stageName})`
    : nextStatus === 'accepted'
    ? `🤝 [Đã Nghiệm thu Bàn giao] ${handover.id} · ${handover.stageName}`
    : `⚠️ [Yêu cầu chỉnh sửa Bàn giao] ${handover.id} · ${handover.stageName}`;

  return {
    username: 'MoveInMate Tracker Bot',
    embeds: [
      {
        title,
        description: isRevertToPending
          ? `**${actorName}** đã chuyển trạng thái điểm giao **${handover.stageName}** từ \`${prevStatus}\` quay về \`pending (Đang làm)\`.`
          : `**${actorName}** vừa cập nhật điểm bàn giao **${handover.stageName}** (${handover.fromMemberCode} ➔ ${handover.toMemberCode}) từ \`${prevStatus}\` sang \`${nextStatus}\`.`,
        color: isRevertToPending
          ? 0x64748b
          : nextStatus === 'accepted'
          ? 0x059669
          : nextStatus === 'ready'
          ? 0x3157d5
          : 0xd97706,
        fields: [
          {
            name: '📋 Đầu vào yêu cầu',
            value: handover.inputRequired,
            inline: false,
          },
        ],
        footer: {
          text: `MoveInMate AI (VHR-16) · Thao tác bởi ${actorCode} (${actorName})`,
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

export async function sendDiscordNotification(
  payload: DiscordWebhookPayload,
  options?: {
    webhookUrl?: string;
    fetchImpl?: typeof fetch;
    allowInTest?: boolean;
  },
): Promise<{ ok: boolean; error?: string }> {
  const isTestEnv =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.MODE === 'test';

  if (isTestEnv && !options?.allowInTest) {
    return { ok: true };
  }

  const url = (options?.webhookUrl ?? resolveDiscordWebhookUrl()).trim();
  if (!url) {
    return { ok: false, error: 'Chưa cấu hình Discord Webhook URL.' };
  }

  const fetchFn =
    options?.fetchImpl ??
    (typeof window !== 'undefined' ? window.fetch.bind(window) : fetch);

  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        ok: false,
        error: `Discord Webhook HTTP ${res.status}`,
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Lỗi kết nối Discord Webhook',
    };
  }
}
