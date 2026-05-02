import type { GenericActionCtx, GenericQueryCtx } from "convex/server";
import { v } from "convex/values";

import type { PlanTier } from "@redux/shared";
import { calculateUsageCharge, getPlanConfig } from "@redux/shared";

import { api } from "../_generated/api";
import type { DataModel } from "../_generated/dataModel";
import { backendEnv } from "../env";
import {
  billingDebugLog,
  billingDebugWarn,
  buildPolarCreditUsageEvent,
  extractMeterCreditSummary,
  getBillingConfig,
  getBillingPeriodKey,
  getPolarSdkClient,
  getUtcMonthBounds,
  resolveTierFromSubscription,
  toSubscriptionSnapshot,
} from "../billing";
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
  if (productId === env.POLAR_FREE_PRODUCT_ID) {
    return "free";
  }
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

const POLAR_NETWORK_TIMEOUT_MS = 10_000;

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

    return {
      tier: subscriptionState.tier,
      subscription: subscriptionState.subscription,
      availableCredits: undefined,
      overageCredits: undefined,
      meterName: getBillingConfig().meterName,
      markupMultiplier: plan.markupMultiplier,
      includedMonthlyCredits: plan.includedMonthlyCredits,
      overageAllowed: plan.overageAllowed,
      currentPeriodStart:
        subscriptionState.subscription?.currentPeriodStart ??
        freePeriodBounds?.start,
      currentPeriodEnd:
        subscriptionState.subscription?.currentPeriodEnd ?? freePeriodBounds?.end,
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
 * Switch between Plus and Pro with per-call Polar proration: upgrades use
 * `invoice` (charge now); downgrades use `next_period` (change at renewal).
 * Free users must use checkout instead.
 */
export const switchCurrentUserPaidPlan = action({
  args: { productId: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ prorationBehavior: "invoice" | "next_period"; targetTier: PlanTier }> => {
    const subscriptionState = await resolveCurrentSubscriptionState(ctx, ctx.userId);
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

    if (targetTier === "free") {
      throw new Error(
        "Moving to the free tier is not available here. Cancel from Manage billing when you want to end a paid plan.",
      );
    }

    const subscription = subscriptionState.subscription;
    const subscriptionId = subscription?.subscriptionId;
    if (!subscriptionId) {
      throw new Error("No subscription found to update.");
    }

    if (subscription?.productId === args.productId) {
      throw new Error("You are already on this plan.");
    }

    const fromRank = planTierRank(subscriptionState.tier);
    const toRank = planTierRank(targetTier);
    const prorationBehavior =
      toRank > fromRank ? ("invoice" as const) : ("next_period" as const);

    const polarSdk = getPolarSdkClient();
    await polarSdk.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate: {
        productId: args.productId,
        prorationBehavior,
      },
    });

    return { prorationBehavior, targetTier };
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
    let polarIngestedAt: number | undefined;

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

  try {
    const polarSdk = getPolarSdkClient();
    const meterName = getBillingConfig().meterName;
    const state = await withTimeout(
      polarSdk.customers.getStateExternal({
        externalId: userId,
      }),
      POLAR_NETWORK_TIMEOUT_MS,
      "polar.customers.getStateExternal",
    );
    const { availableCredits, overageCredits } = extractMeterCreditSummary(
      state,
      meterName,
    );

    return {
      tier: subscriptionState.tier,
      availableCredits,
      overageCredits,
      overageAllowed: plan.overageAllowed,
      grantApplied: false,
      periodKey,
    };
  } catch (error) {
    console.error("Failed to refresh Polar meter state", {
      userId,
      tier: subscriptionState.tier,
      meterName: getBillingConfig().meterName,
      error: getErrorText(error),
    });
    return {
      tier: subscriptionState.tier,
      availableCredits: undefined,
      overageCredits: undefined,
      overageAllowed: plan.overageAllowed,
      grantApplied: false,
      periodKey,
    };
  }
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

    return {
      tier: "free",
      subscription: null,
    };
  }
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

  if (customerId === undefined) {
    const user = await ctx.runQuery(
      api.functions.user.getCurrentUserPolarInfo,
      {},
    );
    try {
      const customer = await polarSdk.customers.create({
        email: user.email,
        externalId: user.userId,
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

  try {
    await ensureFreePolarSubscription(ctx, customerId);
  } catch (error) {
    console.error("billing_free_auto_subscribe_failed", {
      userId: ctx.userId,
      customerId,
      error: getErrorText(error),
    });
  }

  return customerId;
}

async function ensureFreePolarSubscription(
  ctx: BillingActionCtx,
  customerId: string,
): Promise<void> {
  const env = backendEnv();
  const freeProductId = String(env.POLAR_FREE_PRODUCT_ID);

  const existingSubscription = await polar.getCurrentSubscription(ctx, {
    userId: ctx.userId,
  });
  if (existingSubscription) {
    return;
  }

  const polarSdk = getPolarSdkClient();
  if (
    await hasActivePolarSubscriptionForCustomer(polarSdk.subscriptions, customerId)
  ) {
    return;
  }

  type SubscriptionsClient = typeof polarSdk.subscriptions & {
    create?: (args: {
      productId: string;
      customerId: string;
    }) => Promise<unknown>;
  };
  const subscriptionsClient = polarSdk.subscriptions as SubscriptionsClient;
  if (typeof subscriptionsClient.create !== "function") {
    billingDebugWarn("billing_free_auto_subscribe_unsupported_sdk", {
      userId: ctx.userId,
    });
    return;
  }

  await subscriptionsClient.create({
    productId: freeProductId,
    customerId,
  });

  billingDebugLog("billing_free_auto_subscribed", {
    userId: ctx.userId,
    customerId,
    productId: freeProductId,
  });
}

type PolarCustomersClient = ReturnType<typeof getPolarSdkClient>["customers"];
type PolarSubscriptionsClient =
  ReturnType<typeof getPolarSdkClient>["subscriptions"];

async function hasActivePolarSubscriptionForCustomer(
  subscriptions: PolarSubscriptionsClient,
  customerId: string,
): Promise<boolean> {
  const result = await subscriptions.list({
    customerId,
    active: true,
    limit: 1,
  });

  for await (const page of result as AsyncIterable<unknown>) {
    if (getPolarSubscriptionsFromPage(page).length > 0) {
      return true;
    }
  }

  return false;
}

function getPolarSubscriptionsFromPage(page: unknown): unknown[] {
  if (Array.isArray(page)) {
    return page;
  }

  if (!page || typeof page !== "object") {
    return [];
  }

  const candidate = page as Record<string, unknown>;
  const result = candidate.result;
  if (result && typeof result === "object") {
    const resultItems = (result as { items?: unknown }).items;
    if (Array.isArray(resultItems)) {
      return resultItems;
    }
  }

  for (const key of ["items", "subscriptions", "data"]) {
    const value = candidate[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

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