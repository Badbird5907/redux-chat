import { describe, expect, it } from "vitest";

import {
  assertStripeInvoiceCreditPromotionConfig,
  assertSubscriptionPromotionConfig,
  canRedeemForUserCount,
  formatPerUserRedemptionPolicy,
  formatPromotionBenefit,
  getPromotionRedeemableTiers,
  isFullDiscount,
  isGiftedSubscriptionConfig,
  normalizePromotionCode,
  policyFromStoredPerUserLimit,
  storedPerUserLimitFromPolicy,
  UNLIMITED_PER_USER_REDEMPTIONS,
} from "./promotions";

describe("promotion helpers", () => {
  it("normalizes codes consistently", () => {
    expect(normalizePromotionCode(" spring gift ")).toBe("SPRING-GIFT");
  });

  it("defaults missing per-user limit to once per user", () => {
    expect(policyFromStoredPerUserLimit(undefined)).toEqual({ type: "once" });
    expect(formatPerUserRedemptionPolicy(undefined)).toBe("Once per user");
    expect(
      canRedeemForUserCount({
        existingRedemptionCount: 0,
        perUserRedemptionLimit: undefined,
      }),
    ).toBe(true);
    expect(
      canRedeemForUserCount({
        existingRedemptionCount: 1,
        perUserRedemptionLimit: undefined,
      }),
    ).toBe(false);
  });

  it("supports finite per-user limits", () => {
    expect(storedPerUserLimitFromPolicy({ type: "limited", limit: 3 })).toBe(3);
    expect(formatPerUserRedemptionPolicy(3)).toBe("3 per user");
    expect(
      canRedeemForUserCount({
        existingRedemptionCount: 2,
        perUserRedemptionLimit: 3,
      }),
    ).toBe(true);
    expect(
      canRedeemForUserCount({
        existingRedemptionCount: 3,
        perUserRedemptionLimit: 3,
      }),
    ).toBe(false);
  });

  it("supports unlimited per-user redemption", () => {
    expect(storedPerUserLimitFromPolicy({ type: "unlimited" })).toBe(
      UNLIMITED_PER_USER_REDEMPTIONS,
    );
    expect(
      policyFromStoredPerUserLimit(UNLIMITED_PER_USER_REDEMPTIONS),
    ).toEqual({
      type: "unlimited",
    });
    expect(
      canRedeemForUserCount({
        existingRedemptionCount: 100,
        perUserRedemptionLimit: UNLIMITED_PER_USER_REDEMPTIONS,
      }),
    ).toBe(true);
  });

  it("validates subscription promotion config and resolves target tiers", () => {
    const config = {
      mode: "discount",
      freeUsersOnly: false,
      targetTiers: "all",
      discount: { type: "percent", percentOff: 25 },
      duration: { type: "repeating", months: 3 },
      requirePaymentMethod: true,
      cancelIfMissingPaymentMethodAtEnd: false,
    } as const;

    expect(() => assertSubscriptionPromotionConfig(config)).not.toThrow();
    expect(getPromotionRedeemableTiers(config)).toEqual(["plus", "pro"]);
    expect(isGiftedSubscriptionConfig(config)).toBe(false);
    expect(isFullDiscount(config)).toBe(false);
    expect(
      formatPromotionBenefit({
        kind: "subscription_discount",
        config,
      }),
    ).toBe("25% off Plus or Pro for 3 months");
  });

  it("recognizes gifted subscription configs as full discounts", () => {
    const config = {
      mode: "gifted_subscription",
      targetTiers: ["pro"],
      discount: { type: "percent", percentOff: 100 },
      duration: { type: "once" },
      requirePaymentMethod: false,
      cancelIfMissingPaymentMethodAtEnd: true,
    } as const;

    expect(() => assertSubscriptionPromotionConfig(config)).not.toThrow();
    expect(getPromotionRedeemableTiers(config)).toEqual(["pro"]);
    expect(isGiftedSubscriptionConfig(config)).toBe(true);
    expect(isFullDiscount(config)).toBe(true);
  });

  it("rejects invalid gifted subscription configs", () => {
    expect(() =>
      assertSubscriptionPromotionConfig({
        mode: "gifted_subscription",
        targetTiers: ["plus"],
        discount: { type: "percent", percentOff: 99 },
        duration: { type: "once" },
        requirePaymentMethod: false,
        cancelIfMissingPaymentMethodAtEnd: true,
      }),
    ).toThrow("Gifted subscriptions must be configured as 100% off.");
  });

  it("validates Stripe invoice credit configs", () => {
    const config = {
      amountCents: 2500,
      currency: "usd",
      description: "Launch credit",
    } as const;

    expect(() =>
      assertStripeInvoiceCreditPromotionConfig(config),
    ).not.toThrow();
    expect(
      formatPromotionBenefit({
        kind: "stripe_invoice_credit",
        config,
      }),
    ).toBe("$25.00 invoice credit");
    expect(() =>
      assertStripeInvoiceCreditPromotionConfig({
        amountCents: -1,
        currency: "usd",
      }),
    ).toThrow("Invoice credit amount must be a positive cent amount.");
  });
});
