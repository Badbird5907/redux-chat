import { v } from "convex/values";

import type { PlanTier } from "@redux/shared";
import { DEFAULT_BILLING_CONFIG, getPlanConfig } from "@redux/shared";

import {
  getMonthlyExpiresAt,
  getMonthlyPeriodKey,
  grantCreditsTx,
} from "../credits";
import { usageStatsDayKey } from "../usageStats";
import { backendMutation, backendQuery } from "./index";

export const getLegacyMessageSettingsCounts = backendQuery({
  args: {
    secret: v.string(),
  },
  handler: () => {
    return {
      threads: 0,
      defaultMessageSettings: 0,
      threadsWithLegacyToolsArray: 0,
      threadsWithDeprecatedTemperature: 0,
      defaultMessageSettingsWithLegacyToolsArray: 0,
      defaultMessageSettingsWithDeprecatedTemperature: 0,
    };
  },
});

export const backfillLegacyMessageSettingsTools = backendMutation({
  args: {
    secret: v.string(),
  },
  handler: () => {
    return {
      updatedThreads: 0,
      updatedDefaultMessageSettings: 0,
      completedAt: Date.now(),
    };
  },
});

/**
 * Backfill credit grants for an existing user by minting a current-period
 * grant for the user's tier. Idempotent (uses the standard ledger source
 * keys). Intended to be called from admin tooling once per user during the
 * migration cutover.
 *
 * Strategy chosen here = "fresh current-period credits" (option 1 from the
 * plan). This is simpler than importing Polar meter balances and avoids
 * double-counting since Convex becomes authoritative.
 */
export const backfillCurrentPeriodCredits = backendMutation({
  args: {
    secret: v.string(),
    userId: v.string(),
    tier: v.string(),
    paidPeriodStart: v.optional(v.number()),
    paidPeriodEnd: v.optional(v.number()),
    subscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tier = args.tier as PlanTier;
    const plan = getPlanConfig(tier, DEFAULT_BILLING_CONFIG);

    if (tier === "free") {
      const periodKey = getMonthlyPeriodKey();
      const result = await grantCreditsTx(ctx, {
        userId: args.userId,
        bucket: "monthly",
        amount: plan.includedMonthlyCredits,
        source: "free_monthly_reset",
        sourceId: `${args.userId}:${periodKey}`,
        periodKey,
        expiresAt: getMonthlyExpiresAt(),
      });
      return { ...result, tier };
    }

    if (!args.subscriptionId || !args.paidPeriodStart) {
      throw new Error(
        "Paid-tier backfill requires subscriptionId and paidPeriodStart",
      );
    }

    const sourceId = `${args.subscriptionId}:${args.paidPeriodStart}`;
    const result = await grantCreditsTx(ctx, {
      userId: args.userId,
      bucket: "monthly",
      amount: plan.includedMonthlyCredits,
      source: "polar_subscription_renewal",
      sourceId,
      periodKey: new Date(args.paidPeriodStart).toISOString().slice(0, 7),
      expiresAt: args.paidPeriodEnd,
      metadata: { subscriptionId: args.subscriptionId, backfilled: true },
    });
    return { ...result, tier };
  },
});

/**
 * Diagnostic: count active grants and recent debits for a user. Useful for
 * the comparison-against-Polar step described in the rollout plan.
 */
export const getUserCreditLedgerSummary = backendQuery({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const grants = await ctx.db
      .query("creditGrants")
      .withIndex("by_user_status_expires", (q) =>
        q.eq("userId", args.userId).eq("status", "active"),
      )
      .collect();

    const debits = await ctx.db
      .query("creditDebits")
      .withIndex("by_user_createdAt", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    return {
      activeGrantCount: grants.length,
      totalRemaining: grants.reduce((sum, g) => sum + g.remaining, 0),
      recentDebits: debits.length,
      recentDebitTotal: debits.reduce((sum, d) => sum + d.amount, 0),
    };
  },
});

export const backfillUserUsageStats = backendMutation({
  args: {
    secret: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const threads = await ctx.db
      .query("threads")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const messagesByThread = await Promise.all(
      threads.map((thread) =>
        ctx.db
          .query("messages")
          .withIndex("by_threadId", (q) => q.eq("threadId", thread.threadId))
          .collect(),
      ),
    );

    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    const messages = messagesByThread.flat();
    const now = Date.now();
    const lastActiveAt = Math.max(
      0,
      ...threads.map((thread) => thread.updatedAt),
      ...attachments.map((attachment) => attachment.updatedAt),
      ...messages.map((message) => message._creationTime),
    );

    const existingTotals = await ctx.db
      .query("userUsageStats")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    const totals = {
      userMessageCount: messages.filter((message) => message.role === "user")
        .length,
      threadCount: threads.length,
      attachmentCount: attachments.length,
      storageBytes: attachments.reduce(
        (total, attachment) => total + attachment.size,
        0,
      ),
      lastActiveAt: lastActiveAt > 0 ? lastActiveAt : undefined,
      updatedAt: now,
    };

    if (existingTotals === null) {
      await ctx.db.insert("userUsageStats", {
        userId: args.userId,
        ...totals,
        createdAt: now,
      });
    } else {
      await ctx.db.patch(existingTotals._id, totals);
    }

    const existingDailyRows = await ctx.db
      .query("userDailyUsageStats")
      .withIndex("by_user_day", (q) => q.eq("userId", args.userId))
      .collect();
    for (const row of existingDailyRows) {
      await ctx.db.delete(row._id);
    }

    const assistantCallsByDay = new Map<string, number>();
    for (const message of messages) {
      if (message.role !== "assistant" || message.usage === undefined) {
        continue;
      }
      const dayKey = usageStatsDayKey(message._creationTime);
      assistantCallsByDay.set(
        dayKey,
        (assistantCallsByDay.get(dayKey) ?? 0) + 1,
      );
    }

    for (const [dayKey, assistantApiCalls] of assistantCallsByDay) {
      await ctx.db.insert("userDailyUsageStats", {
        userId: args.userId,
        dayKey,
        assistantApiCalls,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      userId: args.userId,
      totalMessages: totals.userMessageCount,
      threadsCreated: totals.threadCount,
      attachmentsUploaded: totals.attachmentCount,
      storageBytes: totals.storageBytes,
      dailyBuckets: assistantCallsByDay.size,
      completedAt: now,
    };
  },
});
