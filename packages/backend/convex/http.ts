import type Stripe from "stripe";
import { registerRoutes } from "@convex-dev/stripe";
import { httpRouter } from "convex/server";

import { DEFAULT_BILLING_CONFIG, getPlanConfig } from "@redux/shared";

import { components, internal } from "./_generated/api";
import { authComponent, initAuth } from "./auth";
import { resolveTierFromSubscription, toSubscriptionSnapshot } from "./billing";
import { backendEnv } from "./env";

const http = httpRouter();

authComponent.registerRoutes(http, initAuth);

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function pickInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function toMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed < 10_000_000_000 ? parsed * 1000 : parsed;
    }
    const dateMs = Date.parse(value);
    return Number.isNaN(dateMs) ? undefined : dateMs;
  }
  return undefined;
}

type CreditTopUpIntentSnapshot = {
  userId: string;
  amountCents: number;
  currency: string;
  credits: number;
  status: "created" | "checkout_created" | "paid" | "expired" | "failed";
};

registerRoutes(http, components.stripe, {
  webhookPath: "/stripe/webhook",
  events: {
    "customer.subscription.created": async (ctx, event) => {
      await handleSubscriptionPeriodGrant(ctx, event);
    },
    "customer.subscription.updated": async (ctx, event) => {
      await handleSubscriptionPeriodGrant(ctx, event);
      const subscription = event.data.object;
      if (subscription.status === "canceled") {
        await handleSubscriptionCancellationRevoke(
          ctx,
          event,
          "customer.subscription.updated",
        );
      }
    },
    "customer.subscription.deleted": async (ctx, event) => {
      await handleSubscriptionCancellationRevoke(
        ctx,
        event,
        "customer.subscription.deleted",
      );
    },
    "checkout.session.completed": async (ctx, event) => {
      await handleCreditTopUpCheckoutCompleted(ctx, event);
      await handlePromotionSubscriptionCheckoutCompleted(ctx, event);
    },
    "checkout.session.expired": async (ctx, event) => {
      await handlePromotionSubscriptionCheckoutExpired(ctx, event);
    },
  },
});

async function handleSubscriptionCancellationRevoke(
  ctx: { runMutation: typeof internal extends never ? never : any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  event:
    | Stripe.CustomerSubscriptionDeletedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent,
  reason: "customer.subscription.deleted" | "customer.subscription.updated",
): Promise<void> {
  const subscription = event.data.object;
  const subscriptionId = subscription.id;
  const userId = pickString(subscription.metadata.userId);

  try {
    if (!userId) {
      await recordStripeAuditEvent(ctx, {
        userId: null,
        action: `stripe:${reason}`,
        status: "failed",
        severity: "high",
        metadata: { subscriptionId, reason: "missing_user_id" },
      });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const revokeResult = (await ctx.runMutation(
      internal.functions.credits.internal_revokeSubscriptionMonthlyCredits,
      {
        userId,
        subscriptionId,
        reason,
      },
    )) as { revoked?: number } | null | undefined;
    const ensureFreeGrant =
      internal.functions.credits
        .internal_ensureFreeMonthlyCreditsAfterPaidCancellation;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const freeGrantResult = (await ctx.runMutation(ensureFreeGrant, {
      userId,
      reason,
    })) as { grantId?: string; created?: boolean; reactivated?: boolean };

    await recordStripeAuditEvent(ctx, {
      userId,
      action: `stripe:${reason}`,
      status: "success",
      severity: "high",
      metadata: {
        subscriptionId,
        revoked: revokeResult?.revoked,
        freeGrant: freeGrantResult,
      },
    });
  } catch (error) {
    console.error("subscription_cancel_revoke_failed", { reason, error });
    await recordStripeAuditEvent(ctx, {
      userId: userId ?? null,
      action: `stripe:${reason}`,
      status: "failed",
      severity: "high",
      metadata: {
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function handleSubscriptionPeriodGrant(
  ctx: { runMutation: typeof internal extends never ? never : any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  event:
    | Stripe.CustomerSubscriptionCreatedEvent
    | Stripe.CustomerSubscriptionUpdatedEvent,
): Promise<void> {
  const subscription = event.data.object;
  const item = subscription.items.data[0];
  const priceId = item?.price.id;
  const userId = pickString(subscription.metadata.userId);
  const action = `stripe:${event.type}`;

  try {
    if (!subscription.id || !priceId || !userId) {
      console.warn("subscription_event_missing_required_fields", {
        subscriptionId: subscription.id,
        priceId,
        userId,
      });
      return;
    }

    const snapshot = toSubscriptionSnapshot(subscription);
    const tier = resolveTierFromSubscription(snapshot);
    if (tier === "free") return;
    if (!["active", "trialing"].includes(subscription.status)) return;

    const periodStart = toMs(item.current_period_start);
    const periodEnd = toMs(item.current_period_end);
    if (periodStart === undefined || periodEnd === undefined) {
      console.warn("subscription_event_missing_period", {
        subscriptionId: subscription.id,
      });
      return;
    }

    const plan = getPlanConfig(tier, DEFAULT_BILLING_CONFIG);
    const sourceId = `${subscription.id}:${periodStart}`;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await ctx.runMutation(
      internal.functions.credits.internal_revokeFreeMonthlyCredits,
      {
        userId,
        reason: "upgraded_to_paid",
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await ctx.runMutation(
      internal.functions.credits.internal_upsertSubscriptionMonthlyCredits,
      {
        userId,
        amount: plan.includedMonthlyCredits,
        sourceId,
        periodKey: new Date(periodStart).toISOString().slice(0, 7),
        expiresAt: periodEnd,
        metadata: {
          subscriptionId: subscription.id,
          tier,
          priceId,
        },
      },
    );

    await recordStripeAuditEvent(ctx, {
      userId,
      action,
      status: "success",
      severity: "medium",
      metadata: {
        subscriptionId: subscription.id,
        tier,
        amount: plan.includedMonthlyCredits,
        periodStart,
        periodEnd,
      },
    });
  } catch (error) {
    console.error("subscription_period_grant_failed", error);
    await recordStripeAuditEvent(ctx, {
      userId: userId ?? null,
      action,
      status: "failed",
      severity: "high",
      metadata: {
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function handleCreditTopUpCheckoutCompleted(
  ctx: {
    runMutation: typeof internal extends never ? never : any; // eslint-disable-line @typescript-eslint/no-explicit-any
    runQuery: typeof internal extends never ? never : any; // eslint-disable-line @typescript-eslint/no-explicit-any
  },
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<void> {
  const session = event.data.object;
  if (session.mode !== "payment" || session.payment_status !== "paid") {
    return;
  }

  const metadata = session.metadata ?? {};
  if (metadata.kind !== "credit_top_up") {
    return;
  }

  const intentId = pickString(metadata.intentId);
  const userId =
    pickString(metadata.userId) ?? pickString(session.client_reference_id);
  const amountCents = pickInteger(metadata.amountCents);
  const credits = pickInteger(metadata.credits);
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;

  try {
    if (
      !intentId ||
      !userId ||
      amountCents === undefined ||
      credits === undefined
    ) {
      throw new Error("credit_top_up_metadata_invalid");
    }
    if (!paymentIntentId) {
      throw new Error("credit_top_up_payment_intent_missing");
    }
    if (
      session.amount_subtotal !== amountCents ||
      session.amount_total !== amountCents
    ) {
      throw new Error("credit_top_up_amount_mismatch");
    }
    if (session.currency?.toLowerCase() !== "usd") {
      throw new Error("credit_top_up_currency_mismatch");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const intent = (await ctx.runQuery(
      internal.functions.billing.internal_getCreditTopUpIntentByIntentId,
      { intentId },
    )) as CreditTopUpIntentSnapshot | null;
    if (!intent) throw new Error("credit_top_up_intent_not_found");
    if (intent.userId !== userId)
      throw new Error("credit_top_up_customer_mismatch");
    if (intent.amountCents !== amountCents || intent.credits !== credits) {
      throw new Error("credit_top_up_intent_amount_mismatch");
    }
    if (intent.currency !== "usd") {
      throw new Error("credit_top_up_intent_currency_mismatch");
    }

    if (intent.status !== "paid") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await ctx.runMutation(internal.functions.credits.internal_grantCredits, {
        userId,
        bucket: "paid",
        amount: credits,
        source: "stripe_one_time_purchase",
        sourceId: paymentIntentId,
        metadata: {
          paymentIntentId,
          checkoutSessionId: session.id,
          intentId,
          amountCents,
          credits,
          productId: backendEnv().STRIPE_CREDIT_TOP_UP_PRODUCT_ID,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      await ctx.runMutation(
        internal.functions.billing.internal_markCreditTopUpIntentPaid,
        {
          intentId,
          userId,
          stripePaymentIntentId: paymentIntentId,
          stripeCheckoutSessionId: session.id,
        },
      );
    }

    await recordStripeAuditEvent(ctx, {
      userId,
      action: "stripe:checkout.session.completed:credit_top_up",
      status: "success",
      severity: "medium",
      metadata: {
        paymentIntentId,
        checkoutSessionId: session.id,
        intentId,
        amountCents,
        credits,
      },
    });
  } catch (error) {
    console.error("credit_top_up_checkout_grant_failed", error);
    await recordStripeAuditEvent(ctx, {
      userId: userId ?? null,
      action: "stripe:checkout.session.completed:credit_top_up",
      status: "failed",
      severity: "high",
      metadata: {
        paymentIntentId,
        checkoutSessionId: session.id,
        intentId,
        amountCents,
        credits,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function handlePromotionSubscriptionCheckoutCompleted(
  ctx: {
    runMutation: typeof internal extends never ? never : any; // eslint-disable-line @typescript-eslint/no-explicit-any
  },
  event: Stripe.CheckoutSessionCompletedEvent,
): Promise<void> {
  const session = event.data.object;
  if (session.mode !== "subscription") {
    return;
  }

  const metadata = session.metadata ?? {};
  if (metadata.kind !== "promotion_subscription") {
    return;
  }

  const promotionId = pickString(metadata.promotionId);
  const redemptionId = pickString(metadata.redemptionId);
  const userId =
    pickString(metadata.userId) ?? pickString(session.client_reference_id);
  const targetTier = pickString(metadata.targetTier);
  const couponId = pickString(metadata.couponId);
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  try {
    if (!promotionId || !redemptionId || !userId) {
      throw new Error("promotion_subscription_metadata_invalid");
    }
    if (targetTier !== "plus" && targetTier !== "pro") {
      throw new Error("promotion_subscription_target_tier_invalid");
    }
    if (!subscriptionId || !customerId) {
      throw new Error("promotion_subscription_missing_stripe_ids");
    }
    if (!isPromotionSubscriptionCheckoutComplete(session)) {
      throw new Error("promotion_subscription_payment_incomplete");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await ctx.runMutation(
      internal.functions.promotions.internal_markPromotionCheckoutCompleted,
      {
        redemptionId,
        userId,
        targetTier,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeCheckoutSessionId: session.id,
        stripeCouponId: couponId,
      },
    );

    await recordStripeAuditEvent(ctx, {
      userId,
      action: "stripe:checkout.session.completed:promotion_subscription",
      status: "success",
      severity: "medium",
      metadata: {
        promotionId,
        redemptionId,
        targetTier,
        subscriptionId,
        checkoutSessionId: session.id,
      },
    });
  } catch (error) {
    console.error("promotion_subscription_checkout_failed", error);
    await recordStripeAuditEvent(ctx, {
      userId: userId ?? null,
      action: "stripe:checkout.session.completed:promotion_subscription",
      status: "failed",
      severity: "high",
      metadata: {
        promotionId,
        redemptionId,
        targetTier,
        subscriptionId,
        checkoutSessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

export function isPromotionSubscriptionCheckoutComplete(
  session: Pick<Stripe.Checkout.Session, "amount_total" | "payment_status">,
): boolean {
  if (session.payment_status === "paid") {
    return true;
  }
  return (
    session.payment_status === "no_payment_required" &&
    session.amount_total === 0
  );
}

async function handlePromotionSubscriptionCheckoutExpired(
  ctx: {
    runMutation: typeof internal extends never ? never : any; // eslint-disable-line @typescript-eslint/no-explicit-any
  },
  event: Stripe.CheckoutSessionExpiredEvent,
): Promise<void> {
  const session = event.data.object;
  if (session.mode !== "subscription") {
    return;
  }

  const metadata = session.metadata ?? {};
  if (metadata.kind !== "promotion_subscription") {
    return;
  }

  const promotionId = pickString(metadata.promotionId);
  const redemptionId = pickString(metadata.redemptionId);
  const userId =
    pickString(metadata.userId) ?? pickString(session.client_reference_id);

  try {
    if (!promotionId || !redemptionId || !userId) {
      throw new Error("promotion_subscription_metadata_invalid");
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await ctx.runMutation(
      internal.functions.promotions.internal_markPromotionRedemptionFailed,
      {
        redemptionId,
        userId,
        failureReason: "Checkout expired.",
        releaseRedemption: true,
        requirePendingCheckout: true,
        stripeCheckoutSessionId: session.id,
      },
    );

    await recordStripeAuditEvent(ctx, {
      userId,
      action: "stripe:checkout.session.expired:promotion_subscription",
      status: "success",
      severity: "medium",
      metadata: {
        promotionId,
        redemptionId,
        checkoutSessionId: session.id,
      },
    });
  } catch (error) {
    console.error("promotion_subscription_checkout_expired_failed", error);
    await recordStripeAuditEvent(ctx, {
      userId: userId ?? null,
      action: "stripe:checkout.session.expired:promotion_subscription",
      status: "failed",
      severity: "high",
      metadata: {
        promotionId,
        redemptionId,
        checkoutSessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

async function recordStripeAuditEvent(
  ctx: { runMutation: typeof internal extends never ? never : any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  args: {
    userId: string | null;
    action: string;
    status: "success" | "failed";
    severity: "low" | "medium" | "high" | "critical";
    metadata?: unknown;
  },
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await ctx.runMutation(
      internal.functions.auditLog.internal_recordEvent,
      args,
    );
  } catch (error) {
    console.error("audit_log_record_failed", { action: args.action, error });
  }
}

export default http;
