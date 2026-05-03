import { httpRouter } from "convex/server";

import { DEFAULT_BILLING_CONFIG, getPlanConfig } from "@redux/shared";

import { internal } from "./_generated/api";
import { authComponent, initAuth } from "./auth";
import { resolveTierFromSubscription, toSubscriptionSnapshot } from "./billing";
import { backendEnv } from "./env";
import { polar } from "./polar";

const http = httpRouter();

authComponent.registerRoutes(http, initAuth);

/** Best-effort timestamp coercion for Polar webhook payloads (Date | string | number). */
function toMs(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

polar.registerRoutes(http, {
  path: "/polar/events",
  events: {
    "subscription.canceled": async (ctx, event) => {
      console.log("subscription.canceled", event);
      const env = backendEnv();
      const { productId } = event.data;
      if (
        productId === env.POLAR_PLUS_PRODUCT_ID ||
        productId === env.POLAR_PRO_PRODUCT_ID
      ) {
        console.log("paid subscription canceled");
        await handleSubscriptionCancellationRevoke(
          ctx,
          event,
          "subscription.canceled",
        );
      }
    },
    "subscription.revoked": async (ctx, event) => {
      console.log("subscription.revoked", event);
      await handleSubscriptionCancellationRevoke(
        ctx,
        event,
        "subscription.revoked",
      );
    },
    /**
     * Subscription created/active: grant the monthly credits for this period.
     * Idempotent on `(source, sourceId)` where sourceId encodes the
     * subscription id + period start so re-deliveries and renewal events
     * don't double-grant.
     */
    "subscription.created": async (ctx, event) => {
      await handleSubscriptionPeriodGrant(ctx, event);
    },
    "subscription.active": async (ctx, event) => {
      await handleSubscriptionPeriodGrant(ctx, event);
    },
    "subscription.updated": async (ctx, event) => {
      await handleSubscriptionPeriodGrant(ctx, event);
    },
    /**
     * One-time purchase: grant `paid` bucket credits. The Polar order id is
     * the source id so duplicate webhook deliveries are no-ops.
     *
     * The amount of credits granted is derived from the metadata key
     * `credits` on the product (set in the Polar dashboard); if absent we
     * skip with a warning rather than guess.
     */
    "order.paid": async (ctx, event) => {
      await handleOneTimeOrderGrant(ctx, event);
    },
  },
});

async function handleSubscriptionCancellationRevoke(
  ctx: { runMutation: typeof internal extends never ? never : any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  event: unknown,
  reason: "subscription.canceled" | "subscription.revoked",
): Promise<void> {
  try {
    const data = (event as { data?: Record<string, unknown> }).data ?? {};
    const subscriptionId = pickString(data.id);
    const userId = pickString(
      (data.customer as Record<string, unknown> | undefined)?.externalId ??
        (data.customer as Record<string, unknown> | undefined)?.external_id ??
        data.externalId ??
        data.external_id,
    );

    if (!userId) {
      console.warn("subscription_cancel_missing_external_id", {
        reason,
        subscriptionId,
      });
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const revokeResult = await ctx.runMutation(
      internal.functions.credits.internal_revokeSubscriptionMonthlyCredits,
      {
        userId,
        subscriptionId,
        reason,
      },
    );
    const revoked =
      revokeResult &&
      typeof revokeResult === "object" &&
      "revoked" in revokeResult &&
      typeof (revokeResult as { revoked?: unknown }).revoked === "number"
        ? (revokeResult as { revoked: number }).revoked
        : undefined;

    console.log("subscription_monthly_grants_revoked", {
      reason,
      userId,
      subscriptionId,
      revoked,
    });
  } catch (error) {
    console.error("subscription_cancel_revoke_failed", { reason, error });
  }
}

async function handleSubscriptionPeriodGrant(
  ctx: { runMutation: typeof internal extends never ? never : any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  event: unknown,
): Promise<void> {
  try {
    const data = (event as { data?: Record<string, unknown> }).data ?? {};
    const subscriptionId = pickString(data.id);
    if (!subscriptionId) {
      console.warn("subscription_event_missing_id", event);
      return;
    }
    const customerExternalId = pickString(
      (data.customer as Record<string, unknown> | undefined)?.externalId ??
        (data.customer as Record<string, unknown> | undefined)?.external_id ??
        data.externalId ??
        data.external_id,
    );
    if (!customerExternalId) {
      console.warn("subscription_event_missing_external_id", {
        subscriptionId,
      });
      return;
    }

    const snapshot = toSubscriptionSnapshot(data);
    const tier = resolveTierFromSubscription(snapshot);
    if (tier === "free") {
      // Free product is intentionally ignored — free credits flow through the
      // Convex `free_monthly_reset` path on first read each month.
      return;
    }

    const periodStart = toMs(
      data.currentPeriodStart ?? data.current_period_start,
    );
    const periodEnd = toMs(data.currentPeriodEnd ?? data.current_period_end);
    if (periodStart === undefined || periodEnd === undefined) {
      console.warn("subscription_event_missing_period", { subscriptionId });
      return;
    }

    const status = pickString(data.status);
    if (status && !["active", "trialing"].includes(status)) {
      // Don't grant for canceled/incomplete states.
      return;
    }

    const plan = getPlanConfig(tier, DEFAULT_BILLING_CONFIG);
    const sourceId = `${subscriptionId}:${periodStart}`;

    // Upgrading to paid should zero out any active free-tier monthly allowance
    // so users don't stack free monthly credits on top of paid recurring grants.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await ctx.runMutation(
      internal.functions.credits.internal_revokeFreeMonthlyCredits,
      {
        userId: customerExternalId,
        reason: "upgraded_to_paid",
      },
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await ctx.runMutation(internal.functions.credits.internal_grantCredits, {
      userId: customerExternalId,
      bucket: "monthly",
      amount: plan.includedMonthlyCredits,
      source: "polar_subscription_renewal",
      sourceId,
      periodKey: new Date(periodStart).toISOString().slice(0, 7),
      expiresAt: periodEnd,
      metadata: {
        subscriptionId,
        tier,
        productId: pickString(data.productId ?? data.product_id),
      },
    });
  } catch (error) {
    console.error("subscription_period_grant_failed", error);
  }
}

async function handleOneTimeOrderGrant(
  ctx: { runMutation: typeof internal extends never ? never : any }, // eslint-disable-line @typescript-eslint/no-explicit-any
  event: unknown,
): Promise<void> {
  try {
    const data = (event as { data?: Record<string, unknown> }).data ?? {};

    // Skip subscription invoice orders; those are handled by subscription.* events.
    const subscriptionId = pickString(
      data.subscriptionId ?? data.subscription_id,
    );
    if (subscriptionId) {
      return;
    }

    const orderId = pickString(data.id);
    if (!orderId) {
      console.warn("order_event_missing_id", event);
      return;
    }
    const customerExternalId = pickString(
      (data.customer as Record<string, unknown> | undefined)?.externalId ??
        (data.customer as Record<string, unknown> | undefined)?.external_id,
    );
    if (!customerExternalId) {
      console.warn("order_event_missing_external_id", { orderId });
      return;
    }

    const product = data.product as Record<string, unknown> | undefined;
    const productMetadata =
      (product?.metadata as Record<string, unknown> | undefined) ?? {};
    const creditsRaw = productMetadata.credits;
    const credits =
      typeof creditsRaw === "number"
        ? creditsRaw
        : typeof creditsRaw === "string"
          ? Number(creditsRaw)
          : NaN;
    if (!Number.isFinite(credits) || credits <= 0) {
      // Not a credit-pack product — ignore.
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    await ctx.runMutation(internal.functions.credits.internal_grantCredits, {
      userId: customerExternalId,
      bucket: "paid",
      amount: Math.floor(credits),
      source: "polar_one_time_purchase",
      sourceId: orderId,
      // Purchased credits are long-lived; configure a per-product expiry by
      // setting `expiresAtMs` in the product metadata if needed.
      expiresAt: parseExpiresFromMetadata(productMetadata),
      metadata: {
        orderId,
        productId: pickString(product?.id),
      },
    });
  } catch (error) {
    console.error("one_time_order_grant_failed", error);
  }
}

function parseExpiresFromMetadata(
  metadata: Record<string, unknown>,
): number | undefined {
  const raw = metadata.expiresAtMs ?? metadata.expires_at_ms;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export default http;
