import { v } from "convex/values";

import { components } from "../_generated/api";
import { internalMutation } from "./internal";

const severityValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("critical"),
);

const statusValidator = v.union(v.literal("success"), v.literal("failed"));

export const internal_recordEvent = internalMutation({
  args: {
    userId: v.union(v.string(), v.null()),
    action: v.string(),
    status: statusValidator,
    severity: severityValidator,
    metadata: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { userId, action, status, severity, metadata, ipAddress },
  ) => {
    await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "auditLog",
        data: {
          userId,
          action,
          status,
          severity,
          ipAddress: ipAddress ?? null,
          userAgent: null,
          metadata: JSON.stringify(metadata ?? {}),
          createdAt: Date.now(),
        },
      },
    });
  },
});
