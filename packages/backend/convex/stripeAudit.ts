import type { GenericActionCtx } from "convex/server";

import type { DataModel } from "./_generated/dataModel";
import { internal } from "./_generated/api";

type StripeAuditCtx = Pick<GenericActionCtx<DataModel>, "runMutation">;

export async function recordStripeAuditEvent(
  ctx: StripeAuditCtx,
  args: {
    userId: string | null;
    action: string;
    status: "success" | "failed";
    severity: "low" | "medium" | "high" | "critical";
    metadata?: unknown;
  },
): Promise<void> {
  try {
    await ctx.runMutation(
      internal.functions.auditLog.internal_recordEvent,
      args,
    );
  } catch (error) {
    console.error("audit_log_record_failed", {
      action: args.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
