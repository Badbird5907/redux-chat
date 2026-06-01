import { Crons } from "@convex-dev/crons";

import { components, internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const crons = new Crons(components.crons);
const ATTACHMENT_EXPIRY_CRON_NAME = "sweep-expired-attachments";
const ATTACHMENT_EXPIRY_CRON_INTERVAL_MS = 60 * 60 * 1000;

export const registerAttachmentExpiryCron = internalMutation({
  args: {},
  handler: async (ctx) => {
    const existingCron = await crons.get(ctx, {
      name: ATTACHMENT_EXPIRY_CRON_NAME,
    });
    if (existingCron !== null) {
      return { registered: false };
    }

    const cronId = await crons.register(
      ctx,
      { kind: "interval", ms: ATTACHMENT_EXPIRY_CRON_INTERVAL_MS },
      internal.functions.attachments.internal_sweepExpiredAttachments,
      {},
      ATTACHMENT_EXPIRY_CRON_NAME,
    );

    return { registered: true, cronId };
  },
});
