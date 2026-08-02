import type { GenericActionCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import { getPlanConfig } from "@redux/shared";

import type { DataModel } from "../_generated/dataModel";
import { components, internal } from "../_generated/api";
import { getBillingConfig, getUtcMonthBounds } from "../billing";
import {
  assertBillingSimulationAvailable,
  billingSimulationSourceId,
  billingSimulationTierValidator,
  getActiveBillingSimulation,
  getBillingSimulationOverride,
  hasActiveRealStripeSubscription,
  hasActiveRealStripeSubscriptionForCustomer,
  isBillingSimulationAvailable,
} from "../billingSimulation";
import {
  ensureFreeMonthlyCreditsAfterPaidCancellationTx,
  getMonthlyPeriodKey,
  revokeBillingSimulationMonthlyCreditsTx,
  revokeFreeMonthlyCreditsTx,
  upsertBillingSimulationMonthlyCreditsTx,
} from "../credits";
import { getStripeSdkClient } from "../stripe";
import { action, query } from "./index";
import { internalMutation, internalQuery } from "./internal";

const STRIPE_NETWORK_TIMEOUT_MS = 10_000;

type SimulationState = {
  available: true;
  active: true;
  tier: "plus" | "pro";
  periodStart: number;
  periodEnd: number;
};

type BillingSimulationActionCtx = GenericActionCtx<DataModel> & {
  userId: string;
};

export const getCurrentUserBillingSimulation = query({
  args: {},
  handler: async (ctx) => {
    const [override, subscriptions] = await Promise.all([
      getActiveBillingSimulation(ctx, ctx.userId),
      ctx.runQuery(components.stripe.public.listSubscriptionsByUserId, {
        userId: ctx.userId,
      }),
    ]);
    const active =
      override !== null && !hasActiveRealStripeSubscription(subscriptions);
    return {
      available: isBillingSimulationAvailable(),
      active,
      tier: active ? override.tier : undefined,
      periodStart: active ? override.periodStart : undefined,
      periodEnd: active ? override.periodEnd : undefined,
    };
  },
});

export const setCurrentUserBillingSimulation = action({
  args: { tier: billingSimulationTierValidator },
  handler: async (ctx, args): Promise<SimulationState> => {
    assertBillingSimulationAvailable();
    const hasPaidSubscription = await hasCurrentUserPaidStripeSubscription(ctx);
    if (hasPaidSubscription) {
      throw new ConvexError(
        "Billing simulation cannot be enabled while a real paid subscription is active.",
      );
    }

    const period = getUtcMonthBounds();
    const plan = getPlanConfig(args.tier, getBillingConfig());
    await ctx.runMutation(
      internal.functions.billingSimulation.internal_setBillingSimulation,
      {
        userId: ctx.userId,
        tier: args.tier,
        periodStart: period.start,
        periodEnd: period.end,
        amount: plan.includedMonthlyCredits,
      },
    );
    return {
      available: true,
      active: true,
      tier: args.tier,
      periodStart: period.start,
      periodEnd: period.end,
    };
  },
});

export const clearCurrentUserBillingSimulation = action({
  args: {},
  handler: async (ctx): Promise<{ ok: true }> => {
    assertBillingSimulationAvailable();
    const hasPaidSubscription = await hasCurrentUserPaidStripeSubscription(ctx);
    await ctx.runMutation(
      internal.functions.billingSimulation.internal_clearBillingSimulation,
      { userId: ctx.userId, restoreFreeGrant: !hasPaidSubscription },
    );
    return { ok: true };
  },
});

export const internal_setBillingSimulation = internalMutation({
  args: {
    userId: v.string(),
    tier: billingSimulationTierValidator,
    periodStart: v.number(),
    periodEnd: v.number(),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await getBillingSimulationOverride(ctx, args.userId);
    if (existing) {
      await ctx.db.patch(existing._id, {
        tier: args.tier,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("billingSimulationOverrides", {
        userId: args.userId,
        tier: args.tier,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        createdAt: now,
        updatedAt: now,
      });
    }

    await revokeFreeMonthlyCreditsTx(ctx, {
      userId: args.userId,
      reason: "billing_simulation_enabled",
    });
    await upsertBillingSimulationMonthlyCreditsTx(ctx, {
      userId: args.userId,
      amount: args.amount,
      sourceId: billingSimulationSourceId(
        args.userId,
        getMonthlyPeriodKey(args.periodStart),
      ),
      periodKey: getMonthlyPeriodKey(args.periodStart),
      expiresAt: args.periodEnd,
      metadata: { tier: args.tier, simulated: true },
    });

    return {
      available: true,
      active: true,
      tier: args.tier,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
    };
  },
});

export const internal_getBillingSimulation = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const override = await getBillingSimulationOverride(ctx, args.userId);
    return {
      available: isBillingSimulationAvailable(),
      override,
      active:
        isBillingSimulationAvailable() &&
        override !== null &&
        override.periodEnd > Date.now(),
    };
  },
});

export const internal_clearBillingSimulation = internalMutation({
  args: {
    userId: v.string(),
    restoreFreeGrant: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reason = args.reason ?? "billing_simulation_cleared";
    const existing = await getBillingSimulationOverride(ctx, args.userId);
    if (existing) await ctx.db.delete(existing._id);
    await revokeBillingSimulationMonthlyCreditsTx(ctx, {
      userId: args.userId,
      reason,
    });
    if (args.restoreFreeGrant) {
      await ensureFreeMonthlyCreditsAfterPaidCancellationTx(ctx, {
        userId: args.userId,
        reason,
      });
    }
    return { ok: true };
  },
});

export const internal_cleanupExpiredBillingSimulation = internalMutation({
  args: { userId: v.string(), restoreFreeGrant: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await getBillingSimulationOverride(ctx, args.userId);
    if (
      !existing ||
      (isBillingSimulationAvailable() && existing.periodEnd > Date.now())
    ) {
      return { cleaned: false };
    }
    const reason = isBillingSimulationAvailable()
      ? "billing_simulation_expired"
      : "billing_simulation_disabled";
    await ctx.db.delete(existing._id);
    await revokeBillingSimulationMonthlyCreditsTx(ctx, {
      userId: args.userId,
      reason,
    });
    if (args.restoreFreeGrant) {
      await ensureFreeMonthlyCreditsAfterPaidCancellationTx(ctx, {
        userId: args.userId,
        reason,
      });
    }
    return { cleaned: true };
  },
});

async function hasCurrentUserPaidStripeSubscription(
  ctx: BillingSimulationActionCtx,
): Promise<boolean> {
  const [subscriptions, componentCustomer, customerOverride] =
    await Promise.all([
      ctx.runQuery(components.stripe.public.listSubscriptionsByUserId, {
        userId: ctx.userId,
      }),
      ctx.runQuery(components.stripe.public.getCustomerByUserId, {
        userId: ctx.userId,
      }),
      ctx.runQuery(
        internal.functions.billing.internal_getStripeCustomerOverride,
        { userId: ctx.userId },
      ),
    ]);
  if (hasActiveRealStripeSubscription(subscriptions)) return true;

  const customerId =
    customerOverride?.stripeCustomerId ?? componentCustomer?.stripeCustomerId;
  if (!customerId) return false;

  const stripe = getStripeSdkClient();
  return await hasActiveRealStripeSubscriptionForCustomer(
    {
      listSubscriptions: async (listedCustomerId) => {
        const listed = await withTimeout(
          stripe.subscriptions.list({
            customer: listedCustomerId,
            status: "all",
            limit: 100,
          }),
          STRIPE_NETWORK_TIMEOUT_MS,
          "stripe.subscriptions.list(simulation guard)",
        );
        return listed.data;
      },
    },
    customerId,
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
