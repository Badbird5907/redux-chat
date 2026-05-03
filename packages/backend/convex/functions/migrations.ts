import { v } from "convex/values";

import { DEFAULT_BILLING_CONFIG, type PlanTier, getPlanConfig } from "@redux/shared";

import {
  getMonthlyExpiresAt,
  getMonthlyPeriodKey,
  grantCreditsTx,
} from "../credits";
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
