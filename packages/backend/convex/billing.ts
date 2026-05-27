import type { BillableToolCall, PlanTier } from "@redux/shared";
import {
  aggregateBillableToolCalls,
  DEFAULT_BILLING_CONFIG,
  getPlanConfig,
} from "@redux/shared";

import { backendEnv } from "./env";

type BillingSubscriptionSnapshot = {
  priceId?: string;
  status?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  customerId?: string;
  subscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
};

export type BillingSubscriptionSchedule = {
  cancelAtPeriodEnd: boolean;
  pendingPriceId: string | undefined;
  pendingAppliesAtMs: number | undefined;
};

export const BILLING_DEBUG_LOGGING = false;

export function billingDebugWarn(
  ...args: Parameters<typeof console.warn>
): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- debug gate
  if (BILLING_DEBUG_LOGGING) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- delegated to console
    console.warn(...args);
  }
}

export function getBillingConfig() {
  return DEFAULT_BILLING_CONFIG;
}

export function getBillingPeriodKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getUtcMonthBounds(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const start = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    1,
    0,
    0,
    0,
    0,
  );
  const end = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return { start, end };
}

export function resolveTierFromSubscription(
  subscription: BillingSubscriptionSnapshot | null | undefined,
) {
  if (!subscription || !isPaidSubscriptionStatus(subscription.status)) {
    return "free" satisfies PlanTier;
  }

  const env = backendEnv();

  if (subscription.priceId === env.STRIPE_PRO_PRICE_ID) {
    return "pro" satisfies PlanTier;
  }

  if (subscription.priceId === env.STRIPE_PLUS_PRICE_ID) {
    return "plus" satisfies PlanTier;
  }

  return "free" satisfies PlanTier;
}

export function isPaidSubscriptionStatus(status: string | undefined) {
  return status === "active" || status === "trialing";
}

export function toSubscriptionSnapshot(
  subscription: unknown,
): BillingSubscriptionSnapshot | null {
  if (!subscription || typeof subscription !== "object") {
    return null;
  }

  const value = subscription as Record<string, unknown>;
  const firstItem = getFirstSubscriptionItem(value);
  const price = firstItem?.price as Record<string, unknown> | undefined;

  const cancelAtPeriodEnd =
    typeof value.cancelAtPeriodEnd === "boolean"
      ? value.cancelAtPeriodEnd
      : typeof value.cancel_at_period_end === "boolean"
        ? value.cancel_at_period_end
        : undefined;

  return {
    priceId: pickString(value.priceId) ?? pickString(price?.id),
    status: pickString(value.status),
    currentPeriodStart:
      toTimestamp(value.currentPeriodStart) ??
      toTimestamp(firstItem?.current_period_start) ??
      toTimestamp(value.current_period_start),
    currentPeriodEnd:
      toTimestamp(value.currentPeriodEnd) ??
      toTimestamp(firstItem?.current_period_end) ??
      toTimestamp(value.current_period_end),
    customerId:
      pickString(value.stripeCustomerId) ??
      pickString(value.customerId) ??
      pickString(value.customer),
    subscriptionId:
      pickString(value.stripeSubscriptionId) ??
      pickString(value.subscriptionId) ??
      pickString(value.id),
    cancelAtPeriodEnd,
  };
}

export function subscriptionScheduleFromStripeSubscription(
  subscription: unknown,
): BillingSubscriptionSchedule {
  const snapshot = toSubscriptionSnapshot(subscription);
  let pendingPriceId: string | undefined;
  let pendingAppliesAtMs: number | undefined;

  if (subscription && typeof subscription === "object") {
    const value = subscription as Record<string, unknown>;
    const scheduleMetadata =
      value.metadata && typeof value.metadata === "object"
        ? (value.metadata as Record<string, unknown>)
        : {};
    pendingPriceId = pickString(
      value.pendingPriceId ??
        value.pending_price_id ??
        scheduleMetadata.pendingPriceId ??
        scheduleMetadata.pending_price_id,
    );
    pendingAppliesAtMs =
      toTimestamp(value.pendingAppliesAtMs) ??
      toTimestamp(value.pending_applies_at_ms) ??
      toTimestamp(scheduleMetadata.pendingAppliesAtMs) ??
      toTimestamp(scheduleMetadata.pending_applies_at_ms);
  }

  return {
    cancelAtPeriodEnd: snapshot?.cancelAtPeriodEnd === true,
    pendingPriceId,
    pendingAppliesAtMs,
  };
}

export function stripeLiveSubscriptionPriceId(
  subscription: unknown,
): string | undefined {
  return toSubscriptionSnapshot(subscription)?.priceId;
}

export function buildBillingAccountRecord(
  userId: string,
  subscription: BillingSubscriptionSnapshot | null,
): {
  userId: string;
  tier: PlanTier;
  status: string;
  stripeCustomerId: string | undefined;
  stripeSubscriptionId: string | undefined;
  currentPeriodStart: number | undefined;
  currentPeriodEnd: number | undefined;
  markupMultiplier: number;
  includedMonthlyCredits: number;
  overageAllowed: boolean;
  updatedAt: number;
} {
  const tier = resolveTierFromSubscription(subscription);
  const plan = getPlanConfig(tier, getBillingConfig());

  return {
    userId,
    tier,
    status: subscription?.status ?? "inactive",
    stripeCustomerId: subscription?.customerId,
    stripeSubscriptionId: subscription?.subscriptionId,
    currentPeriodStart: subscription?.currentPeriodStart,
    currentPeriodEnd: subscription?.currentPeriodEnd,
    markupMultiplier: plan.markupMultiplier,
    includedMonthlyCredits: plan.includedMonthlyCredits,
    overageAllowed: plan.overageAllowed,
    updatedAt: Date.now(),
  };
}

export function buildToolSummaryRecord(
  toolCalls: BillableToolCall[] | undefined,
) {
  return Object.fromEntries(aggregateBillableToolCalls(toolCalls).entries());
}

function getFirstSubscriptionItem(value: Record<string, unknown>) {
  const items = value.items;
  if (!items || typeof items !== "object") {
    return undefined;
  }
  const data = (items as Record<string, unknown>).data;
  if (!Array.isArray(data)) {
    return undefined;
  }
  const first: unknown = data[0];
  return first && typeof first === "object"
    ? (first as Record<string, unknown>)
    : undefined;
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toTimestamp(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}
