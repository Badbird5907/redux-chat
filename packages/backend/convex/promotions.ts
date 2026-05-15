import { ConvexError } from "convex/values";

import type {
  StripeInvoiceCreditPromotionConfig,
  SubscriptionPromotionConfig,
} from "@redux/shared";
import {
  assertStripeInvoiceCreditPromotionConfig as assertSharedStripeInvoiceCreditPromotionConfig,
  assertSubscriptionPromotionConfig as assertSharedSubscriptionPromotionConfig,
  canRedeemForUserCount,
  normalizePromotionCode,
  validateStoredPerUserLimit,
} from "@redux/shared";

export { normalizePromotionCode };

export function assertValidPromotionWindow(args: {
  startsAt?: number;
  endsAt?: number;
}) {
  if (
    args.startsAt !== undefined &&
    (!Number.isFinite(args.startsAt) || args.startsAt <= 0)
  ) {
    throw new ConvexError("Start date is invalid.");
  }
  if (
    args.endsAt !== undefined &&
    (!Number.isFinite(args.endsAt) || args.endsAt <= 0)
  ) {
    throw new ConvexError("End date is invalid.");
  }
  if (
    args.startsAt !== undefined &&
    args.endsAt !== undefined &&
    args.endsAt <= args.startsAt
  ) {
    throw new ConvexError("End date must be after start date.");
  }
}

export function assertValidRedemptionLimits(args: {
  maxRedemptions?: number;
  perUserRedemptionLimit?: number;
}) {
  if (
    args.maxRedemptions !== undefined &&
    (!Number.isInteger(args.maxRedemptions) || args.maxRedemptions <= 0)
  ) {
    throw new ConvexError("Global redemption limit must be positive.");
  }
  try {
    validateStoredPerUserLimit(args.perUserRedemptionLimit);
  } catch (error) {
    throw new ConvexError(
      error instanceof Error
        ? error.message
        : "Per-user redemption limit is invalid.",
    );
  }
}

export function assertPromotionRedeemable(args: {
  status: string;
  redeemedCount: number;
  maxRedemptions?: number;
  startsAt?: number;
  endsAt?: number;
  existingUserRedemptionCount: number;
  perUserRedemptionLimit?: number;
  nowMs?: number;
}) {
  const nowMs = args.nowMs ?? Date.now();
  if (args.status !== "active") {
    throw new ConvexError("This promotion is not active.");
  }
  if (args.startsAt !== undefined && args.startsAt > nowMs) {
    throw new ConvexError("This promotion is not available yet.");
  }
  if (args.endsAt !== undefined && args.endsAt <= nowMs) {
    throw new ConvexError("This promotion has expired.");
  }
  if (
    args.maxRedemptions !== undefined &&
    args.redeemedCount >= args.maxRedemptions
  ) {
    throw new ConvexError("This promotion has reached its redemption limit.");
  }
  if (
    !canRedeemForUserCount({
      existingRedemptionCount: args.existingUserRedemptionCount,
      perUserRedemptionLimit: args.perUserRedemptionLimit,
    })
  ) {
    throw new ConvexError("You have already redeemed this promotion.");
  }
}

export function resolveAppCreditExpiry(args: {
  expiresAt?: number;
  expiresAfterDays?: number;
  nowMs?: number;
}): number | undefined {
  if (args.expiresAt !== undefined) return args.expiresAt;
  if (args.expiresAfterDays === undefined) return undefined;
  return (args.nowMs ?? Date.now()) + args.expiresAfterDays * 86_400_000;
}

export function assertAppCreditsConfig(config: unknown): asserts config is {
  amount: number;
  expiresAt?: number;
  expiresAfterDays?: number;
  note?: string;
} {
  if (!config || typeof config !== "object") {
    throw new ConvexError("App credit promotion config is required.");
  }
  const value = config as Record<string, unknown>;
  const amount = value.amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
    throw new ConvexError("Credit amount must be a positive integer.");
  }
  const expiresAt = value.expiresAt;
  if (
    expiresAt !== undefined &&
    (typeof expiresAt !== "number" || expiresAt <= Date.now())
  ) {
    throw new ConvexError("Credit expiry must be in the future.");
  }
  const expiresAfterDays = value.expiresAfterDays;
  if (
    expiresAfterDays !== undefined &&
    (typeof expiresAfterDays !== "number" ||
      !Number.isInteger(expiresAfterDays) ||
      expiresAfterDays <= 0)
  ) {
    throw new ConvexError("Relative credit expiry must be positive days.");
  }
  if (value.note !== undefined && typeof value.note !== "string") {
    throw new ConvexError("Promotion note is invalid.");
  }
}

export function assertStripeInvoiceCreditConfig(
  config: unknown,
): asserts config is {
  amountCents: number;
  currency: "usd";
} {
  if (!config || typeof config !== "object") {
    throw new ConvexError("Invoice credit promotion config is required.");
  }
  const value = config as Record<string, unknown>;
  if (
    typeof value.amountCents !== "number" ||
    !Number.isInteger(value.amountCents) ||
    value.amountCents <= 0
  ) {
    throw new ConvexError("Invoice credit must be a positive USD amount.");
  }
  if (value.currency !== "usd") {
    throw new ConvexError("Invoice credits must use USD.");
  }
}

export function assertSubscriptionPromotionConfig(
  config: unknown,
): asserts config is SubscriptionPromotionConfig {
  try {
    assertSharedSubscriptionPromotionConfig(config);
  } catch (error) {
    throw new ConvexError(
      error instanceof Error
        ? error.message
        : "Subscription promotion config is invalid.",
    );
  }
}

export function assertStripeInvoiceCreditPromotionConfig(
  config: unknown,
): asserts config is StripeInvoiceCreditPromotionConfig {
  try {
    assertSharedStripeInvoiceCreditPromotionConfig(config);
  } catch (error) {
    throw new ConvexError(
      error instanceof Error
        ? error.message
        : "Invoice credit promotion config is invalid.",
    );
  }
}
