import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { CreditBalance, CreditBucket, PlanTier } from "@redux/shared";
import {
  CREDIT_BUCKETS,
  DEFAULT_BILLING_CONFIG,
  getPlanConfig,
} from "@redux/shared";

import type { DebitCreditsResult, GrantCreditsResult } from "../credits";
import { internal } from "../_generated/api";
import {
  debitCreditsTx,
  getCreditBalanceForUser,
  getMonthlyExpiresAt,
  getMonthlyPeriodKey,
  grantCreditsTx,
  revokeFreeMonthlyCreditsTx,
  revokeSubscriptionMonthlyCreditsTx,
  sweepExpiredGrantsTx,
} from "../credits";
import { backendMutation, mutation, query } from "./index";
import { internalMutation, internalQuery } from "./internal";

const bucketValidator = v.union(
  v.literal("gifted"),
  v.literal("monthly"),
  v.literal("paid"),
);

const grantSourceValidator = v.union(
  v.literal("polar_subscription_renewal"),
  v.literal("polar_one_time_purchase"),
  v.literal("free_monthly_reset"),
  v.literal("admin_grant"),
  v.literal("promotion"),
  v.literal("migration_backfill"),
);

/** Per-user credit summary used by chat preflight + settings. */
export const getCreditBalance = query({
  args: {},
  handler: async (ctx): Promise<CreditBalance> => {
    return await getCreditBalanceForUser(ctx, ctx.userId);
  },
});

/** Paginated credit grant history for the current user. */
export const listCreditGrants = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("creditGrants")
      .withIndex("by_user_granted_at", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      page: results.page.map((grant) => ({
        _id: grant._id,
        grantId: grant.grantId,
        bucket: grant.bucket,
        amount: grant.amount,
        remaining: grant.remaining,
        status: grant.status,
        source: grant.source,
        periodKey: grant.periodKey,
        expiresAt: grant.expiresAt,
        grantedAt: grant.grantedAt,
      })),
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

/**
 * Idempotent monthly allowance grant for free-tier users. Called from a)
 * `getCreditBalance` via the chat preflight refresh path and b) admin /
 * scheduled jobs. Free users get a recurring allowance keyed by
 * `userId + YYYY-MM`; if the row exists we no-op.
 */
export const ensureMonthlyFreeCredits = mutation({
  args: { tier: v.optional(v.string()) },
  handler: async (
    ctx,
    args,
  ): Promise<GrantCreditsResult & { skipped?: boolean }> => {
    const tier = (args.tier ?? "free") as PlanTier;
    const plan = getPlanConfig(tier, DEFAULT_BILLING_CONFIG);
    if (tier !== "free") {
      return {
        grantId: "",
        created: false,
        amount: 0,
        bucket: "monthly",
        skipped: true,
      };
    }

    const periodKey = getMonthlyPeriodKey();
    const sourceId = `${ctx.userId}:${periodKey}`;
    const result = await grantCreditsTx(ctx, {
      userId: ctx.userId,
      bucket: "monthly",
      amount: plan.includedMonthlyCredits,
      source: "free_monthly_reset",
      sourceId,
      periodKey,
      expiresAt: getMonthlyExpiresAt(),
    });
    return result;
  },
});

/**
 * Internal grant API used by webhook actions and admin tooling. Idempotent
 * by `(source, sourceId)`.
 */
export const internal_grantCredits = internalMutation({
  args: {
    userId: v.string(),
    bucket: bucketValidator,
    amount: v.number(),
    source: grantSourceValidator,
    sourceId: v.string(),
    periodKey: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<GrantCreditsResult> => {
    return await grantCreditsTx(ctx, {
      userId: args.userId,
      bucket: args.bucket,
      amount: args.amount,
      source: args.source,
      sourceId: args.sourceId,
      periodKey: args.periodKey,
      expiresAt: args.expiresAt,
      metadata: args.metadata,
    });
  },
});

/**
 * Admin / internal-secret grant entry point. Useful for granting `gifted`
 * promo credits or running ad hoc adjustments.
 */
export const adminGrantCredits = backendMutation({
  args: {
    secret: v.string(),
    userId: v.string(),
    bucket: bucketValidator,
    amount: v.number(),
    source: grantSourceValidator,
    sourceId: v.string(),
    periodKey: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<GrantCreditsResult> => {
    return await grantCreditsTx(ctx, {
      userId: args.userId,
      bucket: args.bucket,
      amount: args.amount,
      source: args.source,
      sourceId: args.sourceId,
      periodKey: args.periodKey,
      expiresAt: args.expiresAt,
      metadata: args.metadata,
    });
  },
});

/**
 * Idempotent debit API. Called from the chat finish handler with a stable
 * `requestKey` (typically the assistant message id) so retries cannot
 * double-charge.
 */
export const internal_debitCredits = internalMutation({
  args: {
    userId: v.string(),
    requestKey: v.string(),
    amount: v.number(),
    overageAllowed: v.boolean(),
    routeId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    rawUsdCost: v.optional(v.number()),
    effectiveUsdCost: v.optional(v.number()),
    markupMultiplier: v.optional(v.number()),
    tier: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<DebitCreditsResult> => {
    try {
      return await debitCreditsTx(ctx, args);
    } catch (error) {
      if (
        error instanceof Error &&
        (error as { code?: string }).code === "INSUFFICIENT_CREDITS"
      ) {
        throw new ConvexError({
          code: "INSUFFICIENT_CREDITS",
          message: "Insufficient credits for debit",
        });
      }
      throw error;
    }
  },
});

/**
 * Internal balance read used by the chat preflight (which goes through an
 * action and therefore cannot call the auth `query` directly without a
 * user identity). Always reads by explicit userId.
 */
export const internal_getBalance = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args): Promise<CreditBalance> => {
    return await getCreditBalanceForUser(ctx, args.userId);
  },
});

/**
 * Internal idempotent ensure-free-monthly-credits called from non-auth
 * contexts (webhooks, scheduled jobs). The auth-bound `mutation` version
 * above is what the client uses on chat preflight.
 */
export const internal_ensureMonthlyFreeCredits = internalMutation({
  args: { userId: v.string(), tier: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<GrantCreditsResult & { skipped?: boolean }> => {
    const tier = args.tier as PlanTier;
    if (tier !== "free") {
      return {
        grantId: "",
        created: false,
        amount: 0,
        bucket: "monthly",
        skipped: true,
      };
    }
    const plan = getPlanConfig(tier, DEFAULT_BILLING_CONFIG);
    const periodKey = getMonthlyPeriodKey();
    return await grantCreditsTx(ctx, {
      userId: args.userId,
      bucket: "monthly",
      amount: plan.includedMonthlyCredits,
      source: "free_monthly_reset",
      sourceId: `${args.userId}:${periodKey}`,
      periodKey,
      expiresAt: getMonthlyExpiresAt(),
    });
  },
});

/**
 * Sweep expired grants for a single user. Cheap to call alongside other
 * read paths; the indexes ensure we only walk that user's `active` rows.
 */
export const internal_sweepExpiredGrants = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await sweepExpiredGrantsTx(ctx, args.userId);
  },
});

/**
 * Revoke active paid subscription monthly grants, used when a subscription is
 * force-canceled immediately in Polar and should no longer keep current-period
 * paid credits.
 */
export const internal_revokeSubscriptionMonthlyCredits = internalMutation({
  args: {
    userId: v.string(),
    subscriptionId: v.optional(v.string()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ revoked: number }> => {
    return await revokeSubscriptionMonthlyCreditsTx(ctx, {
      userId: args.userId,
      subscriptionId: args.subscriptionId,
      reason: args.reason,
    });
  },
});

/**
 * Revoke active free-tier monthly grants once a user is on a paid plan.
 */
export const internal_revokeFreeMonthlyCredits = internalMutation({
  args: {
    userId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ revoked: number }> => {
    return await revokeFreeMonthlyCreditsTx(ctx, {
      userId: args.userId,
      reason: args.reason,
    });
  },
});

// Re-export so callers can `internal.functions.credits.*` from actions.
void internal;

export const _bucketLabels = (): Record<CreditBucket, string> =>
  Object.fromEntries(
    (Object.keys(CREDIT_BUCKETS) as CreditBucket[]).map((b) => [
      b,
      CREDIT_BUCKETS[b].label,
    ]),
  ) as Record<CreditBucket, string>;
