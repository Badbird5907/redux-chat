export const UNLIMITED_PER_USER_REDEMPTIONS = -1;

export const PROMOTION_KINDS = [
  "app_credits",
  "subscription_discount",
  "stripe_invoice_credit",
] as const;

export type PromotionKind = (typeof PROMOTION_KINDS)[number];

export const PROMOTION_STATUSES = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;

export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const PROMOTION_REDEMPTION_STATUSES = [
  "reserved",
  "pending_checkout",
  "applied",
  "failed",
  "revoked",
] as const;

export type PromotionRedemptionStatus =
  (typeof PROMOTION_REDEMPTION_STATUSES)[number];

export type PerUserRedemptionPolicy =
  | { type: "once" }
  | { type: "limited"; limit: number }
  | { type: "unlimited" };

export type AppCreditsPromotionConfig = {
  amount: number;
  expiresAt?: number;
  expiresAfterDays?: number;
  note?: string;
};

export type PromotionSubscriptionTier = "plus" | "pro";

export type SubscriptionTargetTiers =
  | "all"
  | [PromotionSubscriptionTier]
  | readonly [PromotionSubscriptionTier];

export type SubscriptionPromotionConfig = {
  mode: "discount" | "gifted_subscription";
  targetTiers: SubscriptionTargetTiers;
  discount:
    | { type: "percent"; percentOff: number }
    | { type: "amount"; amountOffCents: number; currency: "usd" };
  duration:
    | { type: "once" }
    | { type: "repeating"; months: number }
    | { type: "forever" };
  requirePaymentMethod: boolean;
  cancelIfMissingPaymentMethodAtEnd: boolean;
};

export type StripeInvoiceCreditPromotionConfig = {
  amountCents: number;
  currency: "usd";
  description?: string;
};

export type PromotionConfig =
  | { kind: "app_credits"; config: AppCreditsPromotionConfig }
  | { kind: "subscription_discount"; config: SubscriptionPromotionConfig }
  | {
      kind: "stripe_invoice_credit";
      config: StripeInvoiceCreditPromotionConfig;
    };

export function normalizePromotionCode(code: string): string {
  return code.trim().replace(/\s+/g, "-").toUpperCase();
}

export function storedPerUserLimitFromPolicy(
  policy: PerUserRedemptionPolicy,
): number | undefined {
  if (policy.type === "once") return undefined;
  if (policy.type === "unlimited") return UNLIMITED_PER_USER_REDEMPTIONS;
  return policy.limit;
}

export function policyFromStoredPerUserLimit(
  limit: number | undefined,
): PerUserRedemptionPolicy {
  if (limit === undefined) return { type: "once" };
  if (limit === UNLIMITED_PER_USER_REDEMPTIONS) {
    return { type: "unlimited" };
  }
  return { type: "limited", limit };
}

export function validateStoredPerUserLimit(limit: number | undefined): void {
  if (limit === undefined) return;
  if (limit === UNLIMITED_PER_USER_REDEMPTIONS) return;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Per-user redemption limit must be positive or unlimited.");
  }
}

export function canRedeemForUserCount(args: {
  existingRedemptionCount: number;
  perUserRedemptionLimit: number | undefined;
}): boolean {
  const policy = policyFromStoredPerUserLimit(args.perUserRedemptionLimit);
  if (policy.type === "unlimited") return true;
  if (policy.type === "once") return args.existingRedemptionCount < 1;
  return args.existingRedemptionCount < policy.limit;
}

export function formatPerUserRedemptionPolicy(
  limit: number | undefined,
): string {
  const policy = policyFromStoredPerUserLimit(limit);
  if (policy.type === "once") return "Once per user";
  if (policy.type === "unlimited") return "Unlimited per user";
  return `${policy.limit.toLocaleString()} per user`;
}

export function generatePromotionCode(prefix = "PROMO"): string {
  const suffix = crypto
    .getRandomValues(new Uint8Array(6))
    .reduce((acc, byte) => acc + byte.toString(36).padStart(2, "0"), "")
    .slice(0, 8)
    .toUpperCase();
  return normalizePromotionCode(`${prefix}-${suffix}`);
}

export function getPromotionRedeemableTiers(
  config: SubscriptionPromotionConfig,
): PromotionSubscriptionTier[] {
  if (config.targetTiers === "all") return ["plus", "pro"];
  return [...config.targetTiers];
}

export function isGiftedSubscriptionConfig(
  config: SubscriptionPromotionConfig,
): boolean {
  return config.mode === "gifted_subscription";
}

export function isFullDiscount(config: SubscriptionPromotionConfig): boolean {
  return (
    config.discount.type === "percent" && config.discount.percentOff === 100
  );
}

export function formatPromotionBenefit(promotion: PromotionConfig): string {
  if (promotion.kind === "app_credits") {
    return `${promotion.config.amount.toLocaleString()} gifted credits`;
  }
  if (promotion.kind === "stripe_invoice_credit") {
    return `${formatUsdCents(promotion.config.amountCents)} invoice credit`;
  }

  const config = promotion.config;
  const tiers = getPromotionRedeemableTiers(config)
    .map((tier) => tier.charAt(0).toUpperCase() + tier.slice(1))
    .join(" or ");
  const amount =
    config.discount.type === "percent"
      ? `${config.discount.percentOff}% off`
      : `${formatUsdCents(config.discount.amountOffCents)} off`;
  const duration =
    config.duration.type === "once"
      ? "first invoice"
      : config.duration.type === "forever"
        ? "forever"
        : `${config.duration.months} months`;
  return `${amount} ${tiers} for ${duration}`;
}

export function assertSubscriptionPromotionConfig(
  config: unknown,
): asserts config is SubscriptionPromotionConfig {
  if (!config || typeof config !== "object") {
    throw new Error("Subscription promotion config is required.");
  }
  const value = config as Record<string, unknown>;
  if (value.mode !== "discount" && value.mode !== "gifted_subscription") {
    throw new Error("Subscription promotion mode is invalid.");
  }
  assertTargetTiers(value.targetTiers);
  assertDiscount(value.discount);
  assertDuration(value.duration);
  if (typeof value.requirePaymentMethod !== "boolean") {
    throw new Error("Subscription payment method setting is invalid.");
  }
  if (typeof value.cancelIfMissingPaymentMethodAtEnd !== "boolean") {
    throw new Error("Subscription cancellation setting is invalid.");
  }
  if (value.mode === "gifted_subscription") {
    const discount = value.discount as SubscriptionPromotionConfig["discount"];
    if (discount.type !== "percent" || discount.percentOff !== 100) {
      throw new Error("Gifted subscriptions must be configured as 100% off.");
    }
  }
}

export function assertStripeInvoiceCreditPromotionConfig(
  config: unknown,
): asserts config is StripeInvoiceCreditPromotionConfig {
  if (!config || typeof config !== "object") {
    throw new Error("Stripe invoice credit promotion config is required.");
  }
  const value = config as Record<string, unknown>;
  if (!Number.isInteger(value.amountCents) || Number(value.amountCents) <= 0) {
    throw new Error("Invoice credit amount must be a positive cent amount.");
  }
  if (value.currency !== "usd") {
    throw new Error("Only USD invoice credits are supported.");
  }
  if (
    value.description !== undefined &&
    typeof value.description !== "string"
  ) {
    throw new Error("Invoice credit description is invalid.");
  }
}

function assertTargetTiers(
  value: unknown,
): asserts value is SubscriptionTargetTiers {
  if (value === "all") return;
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error("Subscription target tiers are invalid.");
  }
  if (value[0] !== "plus" && value[0] !== "pro") {
    throw new Error("Subscription target tier is invalid.");
  }
}

function assertDiscount(
  value: unknown,
): asserts value is SubscriptionPromotionConfig["discount"] {
  if (!value || typeof value !== "object") {
    throw new Error("Subscription discount is required.");
  }
  const discount = value as Record<string, unknown>;
  if (discount.type === "percent") {
    if (
      typeof discount.percentOff !== "number" ||
      discount.percentOff <= 0 ||
      discount.percentOff > 100
    ) {
      throw new Error("Percent discount must be between 1 and 100.");
    }
    return;
  }
  if (discount.type === "amount") {
    if (
      !Number.isInteger(discount.amountOffCents) ||
      Number(discount.amountOffCents) <= 0 ||
      discount.currency !== "usd"
    ) {
      throw new Error("Amount discount must be a positive USD cent amount.");
    }
    return;
  }
  throw new Error("Subscription discount type is invalid.");
}

function assertDuration(
  value: unknown,
): asserts value is SubscriptionPromotionConfig["duration"] {
  if (!value || typeof value !== "object") {
    throw new Error("Subscription discount duration is required.");
  }
  const duration = value as Record<string, unknown>;
  if (duration.type === "once" || duration.type === "forever") return;
  if (duration.type === "repeating") {
    if (!Number.isInteger(duration.months) || Number(duration.months) <= 0) {
      throw new Error("Repeating duration must be a positive month count.");
    }
    return;
  }
  throw new Error("Subscription discount duration is invalid.");
}

function formatUsdCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
