import type { GenericActionCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";

import type { PlanTier } from "@redux/shared";
import { calculateUsageCharge, getPlanConfig } from "@redux/shared";

import type { DataModel } from "../_generated/dataModel";
import type { BillingSubscriptionSchedule } from "../billing";
import { api, components, internal } from "../_generated/api";
import {
  billingDebugWarn,
  buildPolarCreditUsageEvent,
  getBillingConfig,
  getBillingPeriodKey,
  getPolarSdkClient,
  getUtcMonthBounds,
  polarLiveSubscriptionProductId,
  resolveTierFromSubscription,
  subscriptionScheduleFromPolarSdkSubscription,
  toSubscriptionSnapshot,
} from "../billing";
import { getCreditBalanceForUser } from "../credits";
import { backendEnv } from "../env";
import { polar } from "../polar";
import { action, query } from "./index";

function planTierRank(tier: PlanTier): number {
  if (tier === "free") {
    return 0;
  }
  if (tier === "plus") {
    return 1;
  }
  return 2;
}

function tierFromPolarProductId(productId: string): PlanTier {
  const env = backendEnv();
  if (productId === env.POLAR_PLUS_PRODUCT_ID) {
    return "plus";
  }
  if (productId === env.POLAR_PRO_PRODUCT_ID) {
    return "pro";
  }
  throw new Error("That product is not a configured plan.");
}

type BillingActionCtx = GenericActionCtx<DataModel> & {
  userId: string;
};

type BillingSubscriptionState = {
  tier: PlanTier;
  subscription: ReturnType<typeof toSubscriptionSnapshot>;
};

type BillingRefreshResult = {
  tier: PlanTier;
  availableCredits: number | undefined;
  overageCredits: number | undefined;
  spendableCredits: number;
  bucketBalances: {
    gifted: number;
    monthly: number;
    paid: number;
  };
  expiringSoon: {
    bucket: "gifted" | "monthly" | "paid";
    grantId: string;
    remaining: number;
    expiresAt: number;
  }[];
  overageAllowed: boolean;
  grantApplied: boolean;
  periodKey: string;
  subscriptionSchedule: BillingSubscriptionSchedule;
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

const POLAR_NETWORK_TIMEOUT_MS = 10_000;

type PolarSdkSubscriptions = ReturnType<typeof getPolarSdkClient>;

async function invokePolarSubscriptionGet(
  polarSdk: PolarSdkSubscriptions,
  subscriptionId: string,
): Promise<unknown> {
  const sub = await polarSdk.subscriptions.get({ id: subscriptionId });
  return sub;
}

async function invokePolarSubscriptionUpdate(
  polarSdk: PolarSdkSubscriptions,
  payload: { id: string; subscriptionUpdate: Record<string, unknown> },
): Promise<void> {
  await polarSdk.subscriptions.update(payload as never);
}

export const getCurrentBillingState = query({
  args: {},
  handler: async (ctx) => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    const plan = getPlanConfig(subscriptionState.tier, getBillingConfig());
    const freePeriodBounds =
      subscriptionState.tier === "free" ? getUtcMonthBounds() : undefined;

    const balance = await getCreditBalanceForUser(ctx, ctx.userId);
    // Backwards-compatible aggregate fields: most existing UI gates on
    // `availableCredits` / `overageCredits`. Map ledger spendable to
    // `availableCredits` so legacy reads keep working until UI is migrated.
    const availableCredits = balance.spendableCredits;
    const overageCredits = 0;

    return {
      tier: subscriptionState.tier,
      subscription: subscriptionState.subscription,
      availableCredits,
      overageCredits,
      spendableCredits: balance.spendableCredits,
      bucketBalances: balance.bucketBalances,
      expiringSoon: balance.expiringSoon,
      meterName: getBillingConfig().meterName,
      markupMultiplier: plan.markupMultiplier,
      includedMonthlyCredits: plan.includedMonthlyCredits,
      overageAllowed: plan.overageAllowed,
      currentPeriodStart:
        subscriptionState.subscription?.currentPeriodStart ??
        freePeriodBounds?.start,
      currentPeriodEnd:
        subscriptionState.subscription?.currentPeriodEnd ??
        freePeriodBounds?.end,
      syncedAt: undefined,
    };
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

/**
 * Switch plans with per-call Polar proration: upgrades use `invoice` (charge
 * now); paid-plan downgrades use `next_period` (change at renewal). Free users
 * must use checkout to start a paid plan. Returning to Free is handled via
 * cancellation / billing portal, not direct product switch.
 */
export const switchCurrentUserPaidPlan = action({
  args: { productId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{
    prorationBehavior: "invoice" | "next_period";
    targetTier: PlanTier;
  }> => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier === "free") {
      throw new Error(
        "Use checkout to subscribe. Plan switches from this page are only for existing paid subscriptions.",
      );
    }

    let targetTier: PlanTier;
    try {
      targetTier = tierFromPolarProductId(args.productId);
    } catch {
      throw new Error("That product is not a configured plan.");
    }

    const subscription = subscriptionState.subscription;
    if (!subscription?.subscriptionId) {
      throw new Error("No subscription found to update.");
    }
    const subscriptionId = subscription.subscriptionId;
    if (subscription.productId === args.productId) {
      throw new Error("You are already on this plan.");
    }

    const fromRank = planTierRank(subscriptionState.tier);
    const toRank = planTierRank(targetTier);
    const prorationBehavior =
      toRank > fromRank ? ("invoice" as const) : ("next_period" as const);

    const polarSdk = getPolarSdkClient();
    await invokePolarSubscriptionUpdate(polarSdk, {
      id: subscriptionId,
      subscriptionUpdate: {
        productId: args.productId,
        prorationBehavior,
      },
    });

    return { prorationBehavior, targetTier };
  },
});

/** Clear Polar’s cancel-at-period-end flag so the paid subscription keeps renewing. */
export const rescindPaidSubscriptionCancellation = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier === "free") {
      throw new Error("Only subscribers on a paid plan can use this action.");
    }
    const subscription = subscriptionState.subscription;
    if (!subscription?.subscriptionId) {
      throw new Error("No subscription found.");
    }
    const subscriptionId = subscription.subscriptionId;
    const polarSdk = getPolarSdkClient();

    let liveSchedule: BillingSubscriptionSchedule;
    try {
      const liveSub: unknown = await withTimeout(
        invokePolarSubscriptionGet(polarSdk, subscriptionId),
        POLAR_NETWORK_TIMEOUT_MS,
        "polar.subscriptions.get",
      );
      liveSchedule = subscriptionScheduleFromPolarSdkSubscription(liveSub);
    } catch (error) {
      throw new Error(
        `Could not read subscription from Polar (${getErrorText(error)}). Try again or use Manage billing.`,
      );
    }

    if (!liveSchedule.cancelAtPeriodEnd) {
      throw new Error(
        "This subscription is not set to cancel at the end of the period.",
      );
    }

    await invokePolarSubscriptionUpdate(polarSdk, {
      id: subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: false },
    });
    return { ok: true };
  },
});

/**
 * Removes a Polar pending product change (`pending_update`), keeping the subscription on
 * the current product past the renewal. Uses `invoice` with the active product Id so Polar
 * applies the current plan immediately and drops the queued downgrade.
 */
export const discardScheduledPaidPlanChange = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    const subscriptionState = await resolveCurrentSubscriptionState(
      ctx,
      ctx.userId,
    );
    if (subscriptionState.tier === "free") {
      throw new Error("Only subscribers on a paid plan can use this action.");
    }
    const subscription = subscriptionState.subscription;
    if (!subscription?.subscriptionId) {
      throw new Error("No subscription found.");
    }
    const subscriptionId = subscription.subscriptionId;
    const polarSdk = getPolarSdkClient();

    let liveSub: unknown;
    try {
      liveSub = await withTimeout(
        invokePolarSubscriptionGet(polarSdk, subscriptionId),
        POLAR_NETWORK_TIMEOUT_MS,
        "polar.subscriptions.get",
      );
    } catch (error) {
      throw new Error(
        `Could not read subscription from Polar (${getErrorText(error)}). Try again or use Manage billing.`,
      );
    }

    const liveSchedule = subscriptionScheduleFromPolarSdkSubscription(liveSub);
    if (
      liveSchedule.pendingProductId == null ||
      liveSchedule.pendingProductId === ""
    ) {
      throw new Error("There is no scheduled plan change to remove.");
    }

    const currentProductId =
      polarLiveSubscriptionProductId(liveSub) ?? subscription.productId;
    if (!currentProductId) {
      throw new Error("Could not determine your current Polar product.");
    }

    if (liveSchedule.pendingProductId === currentProductId) {
      throw new Error(
        "Polar did not report a plan change queued for this renewal.",
      );
    }

    await invokePolarSubscriptionUpdate(polarSdk, {
      id: subscriptionId,
      subscriptionUpdate: {
        productId: currentProductId,
        prorationBehavior: "invoice",
      },
    });
    return { ok: true };
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
    debitId: string | undefined;
    overdraftAmount: number;
  }> => {
    const subscriptionState = await resolveCurrentSubscriptionStateWithFallback(
      ctx,
      ctx.userId,
    );
    const charge = calculateUsageCharge(
      {
        routeId: args.routeId,
        usage: args.usage,
        toolCalls: args.toolCalls,
        tier: subscriptionState.tier,
      },
      getBillingConfig(),
    );

    if (charge.usedPricingFallback) {
      billingDebugWarn("billing_missing_model_pricing", {
        routeId: args.routeId,
        requestId: args.requestId,
        userId: ctx.userId,
      });
    }

    const eventId = crypto.randomUUID();

    // Authoritative debit against the Convex credit ledger. Idempotent on
    // `(userId, requestKey)` so AI SDK retries / stream reconnection cannot
    // double-charge the same generation. We use the assistant `messageId`
    // as the request key — every chat finish event carries one.
    const plan = getPlanConfig(subscriptionState.tier, getBillingConfig());
    let debitId: string | undefined;
    let overdraftAmount = 0;
    try {
      const debit = await ctx.runMutation(
        internal.functions.credits.internal_debitCredits,
        {
          userId: ctx.userId,
          requestKey: args.messageId,
          amount: charge.credits,
          overageAllowed: plan.overageAllowed,
          routeId: args.routeId,
          threadId: args.threadId,
          messageId: args.messageId,
          rawUsdCost: charge.rawUsdCost,
          effectiveUsdCost: charge.effectiveUsdCost,
          markupMultiplier: charge.markupMultiplier,
          tier: subscriptionState.tier,
          metadata: {
            requestId: args.requestId,
            usedPricingFallback: charge.usedPricingFallback,
            toolUsdCost: charge.toolUsdCost,
            modelUsdCost: charge.modelUsdCost,
          },
        },
      );
      debitId = debit.debitId;
      overdraftAmount = debit.overdraftAmount;
    } catch (error) {
      console.error("Failed to debit Convex credits", {
        userId: ctx.userId,
        requestId: args.requestId,
        messageId: args.messageId,
        error: getErrorText(error),
      });
    }

    let polarIngestedAt: number | undefined;
    // Polar cost event ingest is now best-effort analytics only — Convex is
    // authoritative for balances. We continue emitting so Cost Insights
    // (https://polar.sh/docs/features/cost-insights/cost-events) stays
    // populated.
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
        usage: args.usage,
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
      console.error("Failed to ingest Polar credit usage event", {
        userId: ctx.userId,
        requestId: args.requestId,
        error: getErrorText(error),
      });
    }

    return {
      eventId,
      credits: charge.credits,
      polarIngestedAt,
      tier: subscriptionState.tier,
      debitId,
      overdraftAmount,
    };
  },
});

async function refreshBillingStateForUser(
  ctx: BillingActionCtx,
  userId: string,
): Promise<BillingRefreshResult> {
  const subscriptionState = await resolveCurrentSubscriptionStateWithFallback(
    ctx,
    userId,
  );
  await ensurePolarCustomerForCurrentUser(ctx);
  const periodKey = getPeriodKeyForTier(subscriptionState);
  const plan = getPlanConfig(subscriptionState.tier, getBillingConfig());

  // Idempotently refresh free-monthly credits before reading the balance so
  // the very first read in a new month still sees the user's allowance even
  // if scheduled jobs haven't fired yet.
  let grantApplied = false;
  if (subscriptionState.tier === "free") {
    try {
      const grant = await ctx.runMutation(
        internal.functions.credits.internal_ensureMonthlyFreeCredits,
        { userId, tier: subscriptionState.tier },
      );
      grantApplied = grant.created === true;
    } catch (error) {
      console.error("free_monthly_grant_failed", {
        userId,
        error: getErrorText(error),
      });
    }
  }

  // Convex is now authoritative for credit balance. Polar lookups are kept
  // only for subscription schedule details (pending plan changes, cancel
  // flags) which the Convex Polar component does not mirror.
  const balance = await ctx.runQuery(
    internal.functions.credits.internal_getBalance,
    { userId },
  );

  const snapshot = subscriptionState.subscription;
  let subscriptionSchedule: BillingSubscriptionSchedule = {
    cancelAtPeriodEnd: snapshot?.cancelAtPeriodEnd === true,
    pendingProductId: undefined,
    pendingAppliesAtMs: undefined,
  };

  const subscriptionId = snapshot?.subscriptionId;
  if (subscriptionId) {
    try {
      const polarSdk = getPolarSdkClient();
      const liveSub: unknown = await withTimeout(
        invokePolarSubscriptionGet(polarSdk, subscriptionId),
        POLAR_NETWORK_TIMEOUT_MS,
        "polar.subscriptions.get",
      );
      subscriptionSchedule =
        subscriptionScheduleFromPolarSdkSubscription(liveSub);
    } catch (error) {
      console.error("Failed to load Polar subscription schedule", {
        userId,
        subscriptionId,
        error: getErrorText(error),
      });
    }
  }

  return {
    tier: subscriptionState.tier,
    availableCredits: balance.spendableCredits,
    overageCredits: 0,
    spendableCredits: balance.spendableCredits,
    bucketBalances: balance.bucketBalances,
    expiringSoon: balance.expiringSoon,
    overageAllowed: plan.overageAllowed,
    grantApplied,
    periodKey,
    subscriptionSchedule,
  };
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

    try {
      return await resolveCachedSubscriptionState(ctx, userId);
    } catch (fallbackError) {
      console.error("billing_subscription_fallback_failed", {
        userId,
        error: getErrorText(fallbackError),
      });
    }

    return {
      tier: "free",
      subscription: null,
    };
  }
}

async function resolveCachedSubscriptionState(
  ctx: BillingActionCtx,
  userId: string,
): Promise<BillingSubscriptionState> {
  const subscriptions = await ctx.runQuery(
    components.polar.lib.listUserSubscriptions,
    { userId },
  );

  return subscriptions.reduce<BillingSubscriptionState>(
    (best, candidate) => {
      const subscription = toSubscriptionSnapshot(candidate);
      const tier = resolveTierFromSubscription(subscription);

      return planTierRank(tier) > planTierRank(best.tier)
        ? { tier, subscription }
        : best;
    },
    { tier: "free", subscription: null },
  );
}

async function ensurePolarCustomerForCurrentUser(ctx: BillingActionCtx) {
  const polarSdk = getPolarSdkClient();
  let customerId: string | undefined;

  try {
    const customer = await polarSdk.customers.getExternal({
      externalId: ctx.userId,
    });
    customerId = customer.id;
  } catch (error) {
    if (!isPolarNotFoundError(error)) {
      throw error;
    }
  }
  // const userIdentity = await authComponent.getAuthUser(ctx);
  // console.log("userIdentity", userIdentity);

  if (customerId === undefined) {
    const user = await ctx.runQuery(
      api.functions.user.getCurrentUserPolarInfo,
      {},
    );
    try {
      // const image = await ctx.runQuery(api.functions.user.getUserImage, {
      //   userId: ctx.userId,
      // });
      const customer = await polarSdk.customers.create({
        email: user.email,
        externalId: user.userId,
        // avatarUrl: image.image ?? undefined,
        metadata: {
          userId: user.userId,
        },
      });
      customerId = customer.id;
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
        customerId = existingCustomer.id;
      } else {
        const updatedCustomer = await polarSdk.customers.update({
          id: existingCustomer.id,
          customerUpdate: {
            email: user.email,
            externalId: user.userId,
          },
        });
        customerId = updatedCustomer.id;
      }
    }
  }

  // NOTE: free auto-subscribe is intentionally disabled after the Convex
  // credit ledger migration. Free users now receive their monthly credit
  // allowance via `internal_ensureMonthlyFreeCredits`; subscribing to the
  // Polar free product would still grant the deprecated `meter_credit`
  // benefit and double-fund balances. See plan: credit_bucket_ledger.

  return customerId;
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
    return getBillingPeriodKey(
      subscriptionState.subscription.currentPeriodStart,
    );
  }

  return getBillingPeriodKey();
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
