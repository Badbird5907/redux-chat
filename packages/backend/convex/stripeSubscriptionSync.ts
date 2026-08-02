import type { GenericActionCtx } from "convex/server";
import type Stripe from "stripe";

import { getPlanConfig } from "@redux/shared";

import type { DataModel } from "./_generated/dataModel";
import { components, internal } from "./_generated/api";
import {
  getBillingConfig,
  isPaidSubscriptionStatus,
  resolveTierFromSubscription,
  toSubscriptionSnapshot,
} from "./billing";

type StripeSyncCtx = Pick<GenericActionCtx<DataModel>, "runMutation">;

function stringId(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id;
}

function subscriptionPeriod(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  const periodStart = item?.current_period_start;
  const periodEnd = item?.current_period_end;
  return {
    item,
    periodStartMs:
      typeof periodStart === "number" ? periodStart * 1000 : undefined,
    periodEndMs: typeof periodEnd === "number" ? periodEnd * 1000 : undefined,
  };
}

export async function upsertStripeSubscriptionRecord(
  ctx: StripeSyncCtx,
  subscription: Stripe.Subscription,
): Promise<void> {
  const { item } = subscriptionPeriod(subscription);
  if (!item) throw new Error("Stripe subscription is missing an item.");
  const customerId = stringId(subscription.customer);
  if (!customerId)
    throw new Error("Stripe subscription is missing a customer.");

  const args = {
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: item.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    cancelAt: subscription.cancel_at ?? undefined,
    quantity: item.quantity ?? 1,
    priceId: item.price.id,
    metadata: subscription.metadata,
  };
  await ctx.runMutation(components.stripe.private.handleSubscriptionCreated, {
    ...args,
    stripeCustomerId: customerId,
  });
  await ctx.runMutation(
    components.stripe.private.handleSubscriptionUpdated,
    args,
  );
}

export async function syncStripeSubscriptionAllowance(
  ctx: StripeSyncCtx,
  subscription: Stripe.Subscription,
): Promise<{
  userId: string;
  tier: "plus" | "pro";
  amount: number;
  periodStart: number;
  periodEnd: number;
} | null> {
  const snapshot = toSubscriptionSnapshot(subscription);
  const tier = resolveTierFromSubscription(snapshot);
  if (tier === "free" || !isPaidSubscriptionStatus(subscription.status)) {
    return null;
  }
  const userId = subscription.metadata.userId;
  const { item, periodStartMs, periodEndMs } = subscriptionPeriod(subscription);
  if (
    !userId ||
    !item ||
    periodStartMs === undefined ||
    periodEndMs === undefined
  ) {
    throw new Error(
      "Stripe subscription is missing billing metadata or period.",
    );
  }

  const plan = getPlanConfig(tier, getBillingConfig());
  await ctx.runMutation(
    internal.functions.credits.internal_revokeFreeMonthlyCredits,
    { userId, reason: "upgraded_to_paid" },
  );
  await ctx.runMutation(
    internal.functions.credits.internal_upsertSubscriptionMonthlyCredits,
    {
      userId,
      amount: plan.includedMonthlyCredits,
      sourceId: `${subscription.id}:${periodStartMs}`,
      periodKey: new Date(periodStartMs).toISOString().slice(0, 7),
      expiresAt: periodEndMs,
      metadata: {
        subscriptionId: subscription.id,
        tier,
        priceId: item.price.id,
      },
    },
  );
  return {
    userId,
    tier,
    amount: plan.includedMonthlyCredits,
    periodStart: periodStartMs,
    periodEnd: periodEndMs,
  };
}

export async function revokeStripeSubscriptionAllowance(
  ctx: StripeSyncCtx,
  subscription: Stripe.Subscription,
  reason: string,
  restoreFreeGrant: boolean,
): Promise<{ revoked: number }> {
  const userId = subscription.metadata.userId;
  if (!userId) throw new Error("Stripe subscription is missing user metadata.");
  const result = await ctx.runMutation(
    internal.functions.credits.internal_revokeSubscriptionMonthlyCredits,
    { userId, subscriptionId: subscription.id, reason },
  );
  if (restoreFreeGrant) {
    await ctx.runMutation(
      internal.functions.credits
        .internal_ensureFreeMonthlyCreditsAfterPaidCancellation,
      { userId, reason },
    );
  }
  return result;
}

export async function syncStripeCheckoutSessionRecord(
  ctx: StripeSyncCtx,
  session: Stripe.Checkout.Session,
): Promise<void> {
  await ctx.runMutation(
    components.stripe.private.handleCheckoutSessionCompleted,
    {
      stripeCheckoutSessionId: session.id,
      stripeCustomerId: stringId(session.customer),
      mode: session.mode,
      metadata: session.metadata ?? undefined,
    },
  );
}

export async function syncStripeLatestInvoice(
  ctx: StripeSyncCtx,
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<void> {
  const latestInvoice = subscription.latest_invoice;
  if (!latestInvoice) return;
  const invoice =
    typeof latestInvoice === "string"
      ? await stripe.invoices.retrieve(latestInvoice)
      : latestInvoice;
  const customerId = stringId(invoice.customer);
  if (!customerId) return;
  await ctx.runMutation(components.stripe.private.handleInvoiceCreated, {
    stripeInvoiceId: invoice.id,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: invoice.status ?? "open",
    amountDue: invoice.amount_due,
    amountPaid: invoice.amount_paid,
    created: invoice.created,
  });
  if (invoice.status === "paid") {
    await ctx.runMutation(components.stripe.private.handleInvoicePaid, {
      stripeInvoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
    });
  }
}
