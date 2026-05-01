import type { GenericActionCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";

import type { PlanTier } from "@redux/shared";
import { calculateUsageCharge, getPlanConfig } from "@redux/shared";

import { api, internal } from "../_generated/api";
import type { DataModel, Doc } from "../_generated/dataModel";
import {
  buildBillingAccountRecord,
  buildPolarCreditGrantEvent,
  buildPolarCreditUsageEvent,
  buildToolSummaryRecord,
  extractMeterBalance,
  extractMeterCreditSummary,
  getBillingConfig,
  getBillingPeriodKey,
  getPolarSdkClient,
  getUtcMonthBounds,
  resolveTierFromSubscription,
  toSubscriptionSnapshot,
  POLAR_CREDITS_EVENT_NAME,
} from "../billing";
import type { BillingGrantReason, BillingGrantSource } from "../billing";
import { polar } from "../polar";
import { action, query } from "./index";
import { internalMutation, internalQuery } from "./internal";

type BillingActionCtx = GenericActionCtx<DataModel> & {
  userId: string;
};

type BillingSubscriptionState = {
  tier: PlanTier;
  subscription: ReturnType<typeof toSubscriptionSnapshot>;
};

type BillingGrantRecord = Doc<"billingCreditGrants">;

type BillingRefreshResult = {
  tier: PlanTier;
  availableCredits: number | undefined;
  overageCredits: number | undefined;
  overageAllowed: boolean;
  grantApplied: boolean;
  periodKey: string;
};

const usageValidator = v.object({
  inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  cacheReadTokens: v.optional(v.number()),
  cacheWriteTokens: v.optional(v.number()),
  inputAudioTokens: v.optional(v.number()),
  outputAudioTokens: v.optional(v.number()),
});

const toolCallValidator = v.object({
  billingKey: v.string(),
  invocationCount: v.number(),
});

const billingAccountValidator = {
  userId: v.string(),
  tier: v.union(v.literal("free"), v.literal("plus"), v.literal("pro")),
  status: v.string(),
  polarCustomerId: v.optional(v.string()),
  polarSubscriptionId: v.optional(v.string()),
  currentPeriodStart: v.optional(v.number()),
  currentPeriodEnd: v.optional(v.number()),
  markupMultiplier: v.number(),
  includedMonthlyCredits: v.number(),
  overageAllowed: v.boolean(),
};

const billingGrantReasonValidator = v.union(
  v.literal("subscription_created"),
  v.literal("subscription_renewed"),
  v.literal("free_monthly_reset"),
  v.literal("admin_adjustment"),
);

const POLAR_NETWORK_TIMEOUT_MS = 10_000;

export const getCurrentBillingState = query({
  args: {},
  handler: async (ctx) => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    const balanceCache = await ctx.db
      .query("billingBalanceCache")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();
    const plan = getPlanConfig(subscriptionState.tier, getBillingConfig());

    const freePeriodBounds =
      subscriptionState.tier === "free" ? getUtcMonthBounds() : undefined;

    return {
      tier: subscriptionState.tier,
      subscription: subscriptionState.subscription,
      availableCredits: balanceCache?.availableCredits,
      overageCredits: balanceCache?.overageCredits,
      meterName: balanceCache?.meterName ?? getBillingConfig().meterName,
      markupMultiplier: plan.markupMultiplier,
      includedMonthlyCredits: plan.includedMonthlyCredits,
      overageAllowed: plan.overageAllowed,
      currentPeriodStart:
        subscriptionState.subscription?.currentPeriodStart ??
        freePeriodBounds?.start,
      currentPeriodEnd:
        subscriptionState.subscription?.currentPeriodEnd ?? freePeriodBounds?.end,
      syncedAt: balanceCache?.syncedAt,
    };
  },
});

export const getCurrentCreditBalance = query({
  args: {},
  handler: async (ctx) => {
    const cachedBalance = await ctx.db
      .query("billingBalanceCache")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (cachedBalance) {
      return cachedBalance;
    }

    return {
      availableCredits: undefined,
      overageCredits: undefined,
      meterName: getBillingConfig().meterName,
      periodKey: getBillingPeriodKey(),
      syncedAt: undefined,
    };
  },
});

export const listBillingUsageEvents = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    return await ctx.db
      .query("billingUsageEvents")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .take(limit);
  },
});

export const previewGenerationCharge = query({
  args: {
    routeId: v.string(),
    usage: usageValidator,
    toolCalls: v.optional(v.array(toolCallValidator)),
  },
  handler: async (ctx, args) => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );

    return calculateUsageCharge(
      {
        routeId: args.routeId,
        usage: args.usage,
        toolCalls: args.toolCalls,
        tier: subscriptionState.tier,
      },
      getBillingConfig(),
    );
  },
});

export const refreshCurrentUserMeterState = action({
  args: {},
  handler: async (ctx): Promise<BillingRefreshResult> => {
    return await refreshBillingStateForUser(ctx, ctx.userId);
  },
});

export const grantMonthlyCreditsForCurrentUserIfNeeded = action({
  args: {},
  handler: async (ctx): Promise<BillingRefreshResult> => {
    return await refreshBillingStateForUser(ctx, ctx.userId);
  },
});

export const syncSubscriptionTierAndCredits = action({
  args: {},
  handler: async (ctx): Promise<BillingRefreshResult> => {
    return await refreshBillingStateForUser(ctx, ctx.userId);
  },
});

export const ensureCurrentUserPolarCustomer = action({
  args: {},
  handler: async (ctx): Promise<{ customerId: string }> => {
    const customerId = await ensurePolarCustomerForCurrentUser(ctx);
    return { customerId };
  },
});

export const recordUsageEvent = action({
  args: {
    requestId: v.string(),
    messageId: v.string(),
    threadId: v.string(),
    routeId: v.string(),
    usage: usageValidator,
    toolCalls: v.optional(v.array(toolCallValidator)),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    eventId: string;
    credits: number;
    polarIngestedAt: number | undefined;
    tier: PlanTier;
  }> => {
    console.log("Recording usage event", args);
    console.log("billing_record_usage_checkpoint", {
      stage: "before_existing_lookup",
      requestId: args.requestId,
      userId: ctx.userId,
    });
    let existing: Doc<"billingUsageEvents"> | null = null;
    try {
      existing = await withTimeout(
        ctx.runQuery(internal.functions.billing.internal_getUsageEventByRequestId, {
          requestId: args.requestId,
        }),
        5_000,
        "internal_getUsageEventByRequestId",
      );
    } catch (error) {
      console.error("billing_existing_lookup_failed", {
        requestId: args.requestId,
        userId: ctx.userId,
        error: getErrorText(error),
      });
    }
    if (existing) {
      return {
        eventId: existing.eventId,
        credits: existing.credits,
        polarIngestedAt: existing.polarIngestedAt,
        tier: existing.tier,
      };
    }
    console.log("billing_record_usage_checkpoint", {
      stage: "after_existing_lookup",
      requestId: args.requestId,
      userId: ctx.userId,
    });

    const subscriptionState = await resolveCurrentSubscriptionStateWithFallback(
      ctx,
      ctx.userId,
    );
    console.log("billing_record_usage_checkpoint", {
      stage: "after_subscription_resolution",
      requestId: args.requestId,
      userId: ctx.userId,
      tier: subscriptionState.tier,
    });

    const charge = calculateUsageCharge(
      {
        routeId: args.routeId,
        usage: args.usage,
        toolCalls: args.toolCalls,
        tier: subscriptionState.tier,
      },
      getBillingConfig(),
    );

    console.log("billing_charge_computed", {
      userId: ctx.userId,
      tier: subscriptionState.tier,
      routeId: args.routeId,
      usage: args.usage,
      toolCalls: args.toolCalls ?? [],
      charge,
      billingConfig: {
        creditUsdValue: getBillingConfig().creditUsdValue,
        markupMultiplier: getPlanConfig(subscriptionState.tier, getBillingConfig())
          .markupMultiplier,
      },
    });

    console.log("billing_record_usage_checkpoint", {
      stage: "after_charge_computation",
      requestId: args.requestId,
      userId: ctx.userId,
      credits: charge.credits,
    });

    if (charge.usedPricingFallback) {
      console.warn("billing_missing_model_pricing", {
        routeId: args.routeId,
        requestId: args.requestId,
        userId: ctx.userId,
      });
    }

    const eventId = crypto.randomUUID();
    let polarIngestedAt: number | undefined;

    await ctx.runMutation(internal.functions.billing.internal_insertUsageEvent, {
      eventId,
      userId: ctx.userId,
      requestId: args.requestId,
      messageId: args.messageId,
      threadId: args.threadId,
      routeId: args.routeId,
      tier: subscriptionState.tier,
      credits: charge.credits,
      modelUsdCost: charge.modelUsdCost,
      toolUsdCost: charge.toolUsdCost,
      rawUsdCost: charge.rawUsdCost,
      effectiveUsdCost: charge.effectiveUsdCost,
      markupMultiplier: charge.markupMultiplier,
      displayMultiplier: charge.displayMultiplier,
      usedPricingFallback: charge.usedPricingFallback,
      toolSummary: buildToolSummaryRecord(args.toolCalls),
      polarIngestedAt,
      polarEventName: POLAR_CREDITS_EVENT_NAME,
    });

    console.log("billing_record_usage_checkpoint", {
      stage: "after_local_insert",
      requestId: args.requestId,
      userId: ctx.userId,
      eventId,
    });

    try {
      const grantResult = await withTimeout(
        ensureMonthlyCreditsForUser(ctx, ctx.userId, subscriptionState),
        POLAR_NETWORK_TIMEOUT_MS,
        "ensureMonthlyCreditsForUser",
      );
      console.log("billing_record_usage_checkpoint", {
        stage: "after_monthly_credit_check",
        requestId: args.requestId,
        userId: ctx.userId,
        grantApplied: grantResult.grantApplied,
        periodKey: grantResult.periodKey,
      });
    } catch (error) {
      console.error("billing_monthly_credit_check_failed", {
        requestId: args.requestId,
        userId: ctx.userId,
        error: getErrorText(error),
      });
    }

    try {
      const polarSdk = getPolarSdkClient();
      const event = buildPolarCreditUsageEvent({
        userId: ctx.userId,
        requestId: args.requestId,
        messageId: args.messageId,
        threadId: args.threadId,
        routeId: args.routeId,
        tier: subscriptionState.tier,
        charge,
        toolCalls: args.toolCalls,
      });

      await withTimeout(
        polarSdk.events.ingest({
          events: [event],
        }),
        POLAR_NETWORK_TIMEOUT_MS,
        "polar.events.ingest",
      );

      polarIngestedAt = Date.now();
    } catch (error) {
      console.error("Failed to ingest Polar credit usage event", error);
    }

    if (polarIngestedAt !== undefined) {
      await ctx.runMutation(
        internal.functions.billing.internal_markUsageEventPolarIngested,
        {
          requestId: args.requestId,
          polarIngestedAt,
        },
      );
    }

    try {
      await withTimeout(
        refreshBillingStateForUser(ctx, ctx.userId),
        POLAR_NETWORK_TIMEOUT_MS,
        "refreshBillingStateForUser",
      );
    } catch (error) {
      console.error("billing_refresh_after_usage_failed", {
        requestId: args.requestId,
        userId: ctx.userId,
        error: getErrorText(error),
      });
    }

    return {
      eventId,
      credits: charge.credits,
      polarIngestedAt,
      tier: subscriptionState.tier,
    };
  },
});

export const internal_getUsageEventByRequestId = internalQuery({
  args: {
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    return (
      (await ctx.db
        .query("billingUsageEvents")
        .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
        .first()) ?? null
    );
  },
});

export const internal_insertUsageEvent = internalMutation({
  args: {
    eventId: v.string(),
    userId: v.string(),
    requestId: v.string(),
    messageId: v.string(),
    threadId: v.string(),
    routeId: v.string(),
    tier: v.union(v.literal("free"), v.literal("plus"), v.literal("pro")),
    credits: v.number(),
    modelUsdCost: v.number(),
    toolUsdCost: v.number(),
    rawUsdCost: v.number(),
    effectiveUsdCost: v.number(),
    markupMultiplier: v.number(),
    displayMultiplier: v.number(),
    usedPricingFallback: v.boolean(),
    toolSummary: v.record(v.string(), v.number()),
    polarIngestedAt: v.optional(v.number()),
    polarEventName: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingUsageEvents")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .first();

    if (existing) {
      return existing.eventId;
    }

    await ctx.db.insert("billingUsageEvents", {
      ...args,
      createdAt: Date.now(),
    });

    return args.eventId;
  },
});

export const internal_markUsageEventPolarIngested = internalMutation({
  args: {
    requestId: v.string(),
    polarIngestedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingUsageEvents")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!existing) {
      return;
    }

    await ctx.db.patch(existing._id, {
      polarIngestedAt: args.polarIngestedAt,
    });
  },
});

export const internal_upsertBillingAccount = internalMutation({
  args: billingAccountValidator,
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    const patch = {
      ...args,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return;
    }

    await ctx.db.insert("billingAccounts", patch);
  },
});

export const internal_upsertBalanceCache = internalMutation({
  args: {
    userId: v.string(),
    availableCredits: v.optional(v.number()),
    overageCredits: v.optional(v.number()),
    meterName: v.string(),
    periodKey: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingBalanceCache")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    const patch = {
      ...args,
      syncedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return;
    }

    await ctx.db.insert("billingBalanceCache", patch);
  },
});

export const internal_getCreditGrantForPeriod = internalQuery({
  args: {
    userId: v.string(),
    periodKey: v.string(),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("billingCreditGrants")
      .withIndex("by_userId_periodKey", (q) =>
        q.eq("userId", args.userId).eq("periodKey", args.periodKey),
      )
      .collect();

    return rows[0] ?? null;
  },
});

export const internal_insertCreditGrant = internalMutation({
  args: {
    userId: v.string(),
    grantId: v.string(),
    tier: v.union(v.literal("free"), v.literal("plus"), v.literal("pro")),
    periodKey: v.string(),
    credits: v.number(),
    reason: billingGrantReasonValidator,
    polarIngestedAt: v.optional(v.number()),
    sourceRef: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billingCreditGrants")
      .withIndex("by_sourceRef", (q) => q.eq("sourceRef", args.sourceRef))
      .first();

    if (existing) {
      return;
    }

    await ctx.db.insert("billingCreditGrants", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

export const internal_syncBillingAccountFromSubscription = internalMutation({
  args: {
    userId: v.string(),
    productId: v.string(),
    status: v.string(),
    polarCustomerId: v.optional(v.string()),
    polarSubscriptionId: v.optional(v.string()),
    currentPeriodStart: v.optional(v.number()),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const record = buildBillingAccountRecord(args.userId, {
      productId: args.productId,
      status: args.status,
      customerId: args.polarCustomerId,
      subscriptionId: args.polarSubscriptionId,
      currentPeriodStart: args.currentPeriodStart,
      currentPeriodEnd: args.currentPeriodEnd,
    });

    const existing = await ctx.db
      .query("billingAccounts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    const patch = {
      userId: record.userId,
      tier: record.tier,
      status: record.status,
      polarCustomerId: record.polarCustomerId,
      polarSubscriptionId: record.polarSubscriptionId,
      currentPeriodStart: record.currentPeriodStart,
      currentPeriodEnd: record.currentPeriodEnd,
      markupMultiplier: record.markupMultiplier,
      includedMonthlyCredits: record.includedMonthlyCredits,
      overageAllowed: record.overageAllowed,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return;
    }

    await ctx.db.insert("billingAccounts", patch);
  },
});

async function refreshBillingStateForUser(
  ctx: BillingActionCtx,
  userId: string,
): Promise<BillingRefreshResult> {
  console.log("refreshBillingStateForUser", userId);
  const subscriptionState = await resolveCurrentSubscriptionState(ctx, userId);
  const customerId = await ensurePolarCustomerForCurrentUser(ctx);
  const billingAccount = buildBillingAccountRecord(
    userId,
    subscriptionState.subscription,
  );

  console.log("billingAccount", billingAccount);

  await ctx.runMutation(internal.functions.billing.internal_upsertBillingAccount, {
    userId: billingAccount.userId,
    tier: billingAccount.tier,
    status: billingAccount.status,
    polarCustomerId: billingAccount.polarCustomerId ?? customerId,
    polarSubscriptionId: billingAccount.polarSubscriptionId,
    currentPeriodStart: billingAccount.currentPeriodStart,
    currentPeriodEnd: billingAccount.currentPeriodEnd,
    markupMultiplier: billingAccount.markupMultiplier,
    includedMonthlyCredits: billingAccount.includedMonthlyCredits,
    overageAllowed: billingAccount.overageAllowed,
  });

  const grant = await ensureMonthlyCreditsForUser(ctx, userId, subscriptionState);

  try {
    const polarSdk = getPolarSdkClient();
    const meterName = getBillingConfig().meterName;
    const state = await polarSdk.customers.getStateExternal({
      externalId: userId,
    });
    console.log("billing_refresh_customer_state", {
      userId,
      tier: subscriptionState.tier,
      meterName,
      activeMeters: Array.isArray((state as { activeMeters?: unknown }).activeMeters)
        ? ((state as { activeMeters?: unknown }).activeMeters as unknown[]).map(
            (meter) => {
              if (!meter || typeof meter !== "object") {
                return null;
              }

              const candidate = meter as Record<string, unknown>;
              return {
                name:
                  typeof candidate.name === "string"
                    ? candidate.name
                    : candidate.meter &&
                        typeof candidate.meter === "object" &&
                        "name" in candidate.meter
                      ? (candidate.meter as { name?: unknown }).name
                      : undefined,
                balance:
                  typeof candidate.balance === "number"
                    ? candidate.balance
                    : undefined,
                consumedUnits:
                  typeof candidate.consumedUnits === "number"
                    ? candidate.consumedUnits
                    : undefined,
              };
            },
          )
        : [],
    });
    const { availableCredits, overageCredits } = extractMeterCreditSummary(
      state,
      meterName,
    );
    const periodKey = getPeriodKeyForTier(subscriptionState);

    await ctx.runMutation(internal.functions.billing.internal_upsertBalanceCache, {
      userId,
      availableCredits,
      overageCredits,
      meterName,
      periodKey,
    });

    console.log("billing_refresh_balance_result", {
      userId,
      tier: subscriptionState.tier,
      meterName,
      availableCredits,
      overageCredits,
      periodKey,
      grantApplied: grant.grantApplied,
    });

    return {
      tier: subscriptionState.tier,
      availableCredits,
      overageCredits,
      overageAllowed: getPlanConfig(subscriptionState.tier, getBillingConfig())
        .overageAllowed,
      grantApplied: grant.grantApplied,
      periodKey,
    };
  } catch (error) {
    console.error("Failed to refresh Polar meter state", {
      userId,
      tier: subscriptionState.tier,
      meterName: getBillingConfig().meterName,
      error,
    });
    return {
      tier: subscriptionState.tier,
      availableCredits: undefined,
      overageCredits: undefined,
      overageAllowed: getPlanConfig(subscriptionState.tier, getBillingConfig())
        .overageAllowed,
      grantApplied: grant.grantApplied,
      periodKey: grant.periodKey,
    };
  }
}

async function ensureMonthlyCreditsForUser(
  ctx: BillingActionCtx,
  userId: string,
  subscriptionState: BillingSubscriptionState,
): Promise<{ grantApplied: boolean; periodKey: string }> {
  const periodKey = getPeriodKeyForTier(subscriptionState);
  const plan = getPlanConfig(subscriptionState.tier, getBillingConfig());

  if (plan.includedMonthlyCredits <= 0) {
    return { grantApplied: false, periodKey };
  }

  const existingGrant: BillingGrantRecord | null = await ctx.runQuery(
    internal.functions.billing.internal_getCreditGrantForPeriod,
    {
      userId,
      periodKey,
    },
  );

  if (existingGrant) {
    return { grantApplied: false, periodKey };
  }

  await ensurePolarCustomerForCurrentUser(ctx);

  const priorGrantForTier = await ctx.runQuery(
    internal.functions.billing.internal_hasAnyCreditGrantForTier,
    {
      userId,
      tier: subscriptionState.tier,
    },
  );

  let creditsToGrant = plan.includedMonthlyCredits;
  if (subscriptionState.tier === "free") {
    try {
      const polarSdk = getPolarSdkClient();
      const state = await polarSdk.customers.getStateExternal({
        externalId: userId,
      });
      const availableCredits =
        extractMeterBalance(state, getBillingConfig().meterName) ?? 0;
      creditsToGrant = Math.max(0, plan.includedMonthlyCredits - availableCredits);
      console.log("billing_free_top_up_calculated", {
        userId,
        periodKey,
        availableCredits,
        targetCredits: plan.includedMonthlyCredits,
        creditsToGrant,
      });
    } catch (error) {
      console.error("Failed to calculate free-tier top-up credits", {
        userId,
        periodKey,
        error,
      });
    }
  }

  const reason = getGrantReason(subscriptionState.tier, priorGrantForTier);
  const source = getGrantSource(subscriptionState.tier);
  const sourceRef = getGrantSourceRef(userId, subscriptionState, periodKey, source);
  const grantId = crypto.randomUUID();
  let polarIngestedAt: number | undefined;

  if (creditsToGrant === 0) {
    await ctx.runMutation(internal.functions.billing.internal_insertCreditGrant, {
      userId,
      grantId,
      tier: subscriptionState.tier,
      periodKey,
      credits: 0,
      reason,
      polarIngestedAt: undefined,
      sourceRef,
    });

    return { grantApplied: false, periodKey };
  }

  try {
    const polarSdk = getPolarSdkClient();
    await polarSdk.events.ingest({
      events: [
        buildPolarCreditGrantEvent({
          userId,
          credits: creditsToGrant,
          tier: subscriptionState.tier,
          periodKey,
          reason,
          source,
        }),
      ],
    });
    polarIngestedAt = Date.now();
  } catch (error) {
    console.error("Failed to ingest Polar credit grant event", error);
  }

  if (polarIngestedAt === undefined) {
    return { grantApplied: false, periodKey };
  }

  await ctx.runMutation(internal.functions.billing.internal_insertCreditGrant, {
    userId,
    grantId,
    tier: subscriptionState.tier,
    periodKey,
    credits: creditsToGrant,
    reason,
    polarIngestedAt,
    sourceRef,
  });

  return { grantApplied: true, periodKey };
}

async function resolveCurrentSubscriptionState(
  ctx: GenericQueryCtx<DataModel> | BillingActionCtx,
  userId: string,
): Promise<BillingSubscriptionState> {
  const subscription = toSubscriptionSnapshot(
    await polar.getCurrentSubscription(ctx, { userId }),
  );

  return {
    tier: resolveTierFromSubscription(subscription),
    subscription,
  };
}

async function resolveCurrentSubscriptionStateWithFallback(
  ctx: BillingActionCtx,
  userId: string,
): Promise<BillingSubscriptionState> {
  try {
    return await withTimeout(
      resolveCurrentSubscriptionState(ctx, userId),
      POLAR_NETWORK_TIMEOUT_MS,
      "resolveCurrentSubscriptionState",
    );
  } catch (error) {
    console.error("billing_subscription_resolution_failed", {
      userId,
      error: getErrorText(error),
    });

    const cachedBillingAccount = await ctx.runQuery(
      internal.functions.billing.internal_getBillingAccountByUserId,
      { userId },
    );

    const fallbackTier = cachedBillingAccount?.tier ?? "free";

    return {
      tier: fallbackTier,
      subscription:
        fallbackTier === "free"
          ? null
          : {
              productKey: fallbackTier,
              status: cachedBillingAccount?.status,
              currentPeriodStart: cachedBillingAccount?.currentPeriodStart,
              currentPeriodEnd: cachedBillingAccount?.currentPeriodEnd,
              customerId: cachedBillingAccount?.polarCustomerId,
              subscriptionId: cachedBillingAccount?.polarSubscriptionId,
            },
    };
  }
}

async function ensurePolarCustomerForCurrentUser(ctx: BillingActionCtx) {
  const polarSdk = getPolarSdkClient();

  try {
    const customer = await polarSdk.customers.getExternal({
      externalId: ctx.userId,
    });
    return customer.id;
  } catch (error) {
    if (!isPolarNotFoundError(error)) {
      throw error;
    }
  }

  const user = await ctx.runQuery(api.functions.user.getCurrentUserPolarInfo, {});
  try {
    const customer = await polarSdk.customers.create({
      email: user.email,
      externalId: user.userId,
      metadata: {
        userId: user.userId,
      },
    });

    return customer.id;
  } catch (error) {
    if (!isPolarDuplicateCustomerEmailError(error)) {
      throw error;
    }

    const existingCustomer = await findPolarCustomerByEmail(
      polarSdk.customers,
      user.email,
    );
    if (!existingCustomer) {
      throw error;
    }

    const existingExternalId = getPolarCustomerExternalId(existingCustomer);
    if (existingExternalId && existingExternalId !== user.userId) {
      throw new Error(
        `Polar customer ${existingCustomer.id} already belongs to a different external user`,
      );
    }

    if (existingExternalId === user.userId) {
      return existingCustomer.id;
    }

    const updatedCustomer = await polarSdk.customers.update({
      id: existingCustomer.id,
      customerUpdate: {
        email: user.email,
        externalId: user.userId,
      },
    });

    return updatedCustomer.id;
  }
}

type PolarCustomersClient = ReturnType<typeof getPolarSdkClient>["customers"];

type PolarCustomerRecord = {
  id: string;
  email?: string | null;
  externalId?: string | null;
  external_id?: string | null;
};

async function findPolarCustomerByEmail(
  customers: PolarCustomersClient,
  email: string,
): Promise<PolarCustomerRecord | null> {
  const normalizedEmail = normalizeEmail(email);
  const result = await customers.list({});

  for await (const page of result as AsyncIterable<unknown>) {
    for (const customer of getPolarCustomersFromPage(page)) {
      if (normalizeEmail(customer.email) === normalizedEmail) {
        return customer;
      }
    }
  }

  return null;
}

function getPolarCustomersFromPage(page: unknown): PolarCustomerRecord[] {
  if (Array.isArray(page)) {
    return page.filter(isPolarCustomerRecord);
  }

  if (!page || typeof page !== "object") {
    return [];
  }

  const candidate = page as Record<string, unknown>;
  for (const key of ["items", "customers", "data", "result"]) {
    const value = candidate[key];
    if (Array.isArray(value)) {
      return value.filter(isPolarCustomerRecord);
    }
  }

  return isPolarCustomerRecord(page) ? [page] : [];
}

function isPolarCustomerRecord(value: unknown): value is PolarCustomerRecord {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string"
  );
}

function getPolarCustomerExternalId(customer: PolarCustomerRecord) {
  return customer.externalId ?? customer.external_id ?? undefined;
}

function normalizeEmail(email: string | null | undefined) {
  return email?.trim().toLowerCase() ?? "";
}

function getPeriodKeyForTier(subscriptionState: BillingSubscriptionState) {
  if (
    subscriptionState.tier !== "free" &&
    subscriptionState.subscription?.currentPeriodStart !== undefined
  ) {
    return getBillingPeriodKey(subscriptionState.subscription.currentPeriodStart);
  }

  return getBillingPeriodKey();
}

function getGrantReason(
  tier: PlanTier,
  priorGrantForTier: boolean,
): BillingGrantReason {
  if (tier === "free") {
    return "free_monthly_reset";
  }

  return priorGrantForTier ? "subscription_renewed" : "subscription_created";
}

function getGrantSource(tier: PlanTier): BillingGrantSource {
  return tier === "free" ? "free_monthly_reset" : "subscription_renewal";
}

function getGrantSourceRef(
  userId: string,
  subscriptionState: BillingSubscriptionState,
  periodKey: string,
  source: BillingGrantSource,
) {
  if (source === "free_monthly_reset") {
    return `free:${userId}:${periodKey}`;
  }

  return `${
    subscriptionState.subscription?.subscriptionId ??
    `${userId}:${subscriptionState.tier}`
  }:${periodKey}`;
}

function isPolarNotFoundError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    statusCode?: number;
    response?: { status?: number };
    message?: string;
  };

  return (
    candidate.statusCode === 404 ||
    candidate.response?.status === 404 ||
    (typeof candidate.message === "string" &&
      candidate.message.toLowerCase().includes("not found"))
  );
}

function isPolarDuplicateCustomerEmailError(error: unknown) {
  const message = getErrorText(error).toLowerCase();

  return message.includes("customer with this email address already exists");
}

function getErrorText(error: unknown): string {
  if (!error) {
    return "";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return `${error.name} ${error.message}`;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "";
  }
}

export const internal_hasAnyCreditGrantForTier = internalQuery({
  args: {
    userId: v.string(),
    tier: v.union(v.literal("free"), v.literal("plus"), v.literal("pro")),
  },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("billingCreditGrants")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();

    return rows.some((row) =>
      args.tier === "free" ? row.tier === "free" : row.tier === args.tier,
    );
  },
});

export const internal_getBillingAccountByUserId = internalQuery({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    return (
      (await ctx.db
        .query("billingAccounts")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .first()) ?? null
    );
  },
});

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}
