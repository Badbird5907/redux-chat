import { Crons } from "@convex-dev/crons";

import { components, internal } from "./_generated/api";
import { internalMutation } from "./functions/internal";

const crons = new Crons(components.crons);
const ATTACHMENT_EXPIRY_CRON_NAME = "sweep-expired-attachments";
const ATTACHMENT_EXPIRY_CRON_INTERVAL_MS = 60 * 60 * 1000;
const SKILL_PROPOSAL_CLEANUP_CRON_NAME = "cleanup-expired-skill-proposals";
const SKILL_PROPOSAL_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

export const registerAttachmentExpiryCron = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ registered: false } | { registered: true; cronId: string }> => {
    const existingCron = await crons.get(ctx, {
      name: ATTACHMENT_EXPIRY_CRON_NAME,
    });
    if (existingCron !== null) {
      return { registered: false };
    }

    const cronId: string = await crons.register(
      ctx,
      { kind: "interval", ms: ATTACHMENT_EXPIRY_CRON_INTERVAL_MS },
      internal.functions.attachments.internal_sweepExpiredAttachments,
      {},
      ATTACHMENT_EXPIRY_CRON_NAME,
    );

    return { registered: true, cronId };
  },
});

export const registerSkillProposalCleanupCron = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ registered: false } | { registered: true; cronId: string }> => {
    const existingCron = await crons.get(ctx, {
      name: SKILL_PROPOSAL_CLEANUP_CRON_NAME,
    });
    if (existingCron !== null) {
      return { registered: false };
    }

    const cronId: string = await crons.register(
      ctx,
      { kind: "interval", ms: SKILL_PROPOSAL_CLEANUP_INTERVAL_MS },
      internal.functions.skills.internal_cleanupExpiredProposals,
      {},
      SKILL_PROPOSAL_CLEANUP_CRON_NAME,
    );

    return { registered: true, cronId };
  },
});
