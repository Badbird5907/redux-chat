import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import { computePaidSubscriberPromotionFreeUntil } from "../promotions";
import schema from "../schema";
import { modules } from "../test.setup";
import {
  buildPromotionSubscriptionCheckoutParams,
  promotionStripeIdempotencyKey,
  shouldCreateDirectSubscriptionForPromotion,
} from "./promotions";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const NOW = 1_700_000_000_000;

function testDb() {
  return convexTest(schema, modules);
}

async function insertAppCreditPromotion(
  t: ReturnType<typeof testDb>,
  args: {
    code?: string;
    amount?: number;
    eligiblePlanTiers?: "all" | ("free" | "plus" | "pro")[];
    maxRedemptions?: number;
    perUserRedemptionLimit?: number;
    pauseOnRedemptionLimit?: boolean;
  } = {},
) {
  const promotionId = crypto.randomUUID();
  await t.run(async (ctx) => {
    await ctx.db.insert("promotions", {
      promotionId,
      code: args.code ?? "PROMO",
      codeNormalized: args.code ?? "PROMO",
      name: "Test promotion",
      status: "active",
      kind: "app_credits",
      maxRedemptions: args.maxRedemptions,
      perUserRedemptionLimit: args.perUserRedemptionLimit,
      pauseOnRedemptionLimit: args.pauseOnRedemptionLimit,
      redeemedCount: 0,
      createdByUserId: "admin",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        config: {
          amount: args.amount ?? 100,
          eligiblePlanTiers: args.eligiblePlanTiers,
        },
      },
    });
  });
  return promotionId;
}

async function listRedemptions(
  t: ReturnType<typeof testDb>,
  promotionId: string,
) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("promotionRedemptions")
      .withIndex("by_promotion_reservedAt", (q) =>
        q.eq("promotionId", promotionId),
      )
      .collect(),
  );
}

async function insertSubscriptionCheckoutRedemption(
  t: ReturnType<typeof testDb>,
  args: {
    status: "pending_checkout" | "failed" | "applied";
    redemptionId?: string;
    stripeCheckoutSessionId?: string;
    targetTier?: "plus" | "pro";
  },
) {
  const promotionId = crypto.randomUUID();
  const redemptionId = args.redemptionId ?? crypto.randomUUID();
  await t.run(async (ctx) => {
    await ctx.db.insert("promotions", {
      promotionId,
      code: "SUBPROMO",
      codeNormalized: "SUBPROMO",
      name: "Subscription promotion",
      status: "active",
      kind: "subscription_discount",
      redeemedCount: 1,
      createdByUserId: "admin",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        config: {
          mode: "discount",
          freeUsersOnly: true,
          targetTiers: ["plus"],
          discount: { type: "percent", percentOff: 50 },
          duration: { type: "repeating", months: 3 },
          requirePaymentMethod: true,
          cancelIfMissingPaymentMethodAtEnd: false,
        },
      },
    });
    await ctx.db.insert("promotionRedemptions", {
      redemptionId,
      promotionId,
      codeNormalized: "SUBPROMO",
      userId: USER_ID,
      status: args.status,
      kind: "subscription_discount",
      targetTier: args.targetTier ?? "plus",
      reservedAt: NOW,
      stripeCustomerId: "cus_existing",
      stripeCouponId: "coupon_existing",
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      metadata: {
        promotionName: "Subscription promotion",
      },
    });
  });
  return { promotionId, redemptionId };
}

describe("functions/promotions", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CONVEX_SECRET", "test-internal-secret");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("default policy allows one redemption per user", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root);
    const user = root.withIdentity({ subject: USER_ID });

    await expect(
      user.action(api.functions.promotions.redeemPromotion, { code: "PROMO" }),
    ).resolves.toMatchObject({ status: "applied", amount: 100 });

    await expect(
      user.action(api.functions.promotions.redeemPromotion, { code: "PROMO" }),
    ).rejects.toThrow(/already redeemed/);

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]?.status).toBe("applied");
  });

  it("limited policy allows exactly N redemptions per user", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      perUserRedemptionLimit: 2,
    });
    const user = root.withIdentity({ subject: USER_ID });

    await user.action(api.functions.promotions.redeemPromotion, {
      code: "PROMO",
    });
    await user.action(api.functions.promotions.redeemPromotion, {
      code: "PROMO",
    });
    await expect(
      user.action(api.functions.promotions.redeemPromotion, { code: "PROMO" }),
    ).rejects.toThrow(/already redeemed/);

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions).toHaveLength(2);
  });

  it("unlimited per-user policy allows repeated redemptions until global limit", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      perUserRedemptionLimit: -1,
      maxRedemptions: 3,
    });
    const user = root.withIdentity({ subject: USER_ID });

    await user.action(api.functions.promotions.redeemPromotion, {
      code: "PROMO",
    });
    await user.action(api.functions.promotions.redeemPromotion, {
      code: "PROMO",
    });
    await user.action(api.functions.promotions.redeemPromotion, {
      code: "PROMO",
    });
    await expect(
      user.action(api.functions.promotions.redeemPromotion, { code: "PROMO" }),
    ).rejects.toThrow(/not active/);

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions).toHaveLength(3);
  });

  it("global max redemptions caps usage across users", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      maxRedemptions: 1,
    });

    await root
      .withIdentity({ subject: USER_ID })
      .action(api.functions.promotions.redeemPromotion, { code: "PROMO" });
    await expect(
      root
        .withIdentity({ subject: OTHER_USER_ID })
        .action(api.functions.promotions.redeemPromotion, { code: "PROMO" }),
    ).rejects.toThrow(/not active/);

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions).toHaveLength(1);
  });

  it("auto-archives the promotion when the global limit is reached", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      maxRedemptions: 1,
    });

    await root
      .withIdentity({ subject: USER_ID })
      .action(api.functions.promotions.redeemPromotion, { code: "PROMO" });

    const promotion = await root.run(async (ctx) =>
      ctx.db
        .query("promotions")
        .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
        .unique(),
    );
    expect(promotion?.status).toBe("archived");
  });

  it("auto-pauses (instead of archiving) when pauseOnRedemptionLimit is on", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      maxRedemptions: 1,
      pauseOnRedemptionLimit: true,
    });

    await root
      .withIdentity({ subject: USER_ID })
      .action(api.functions.promotions.redeemPromotion, { code: "PROMO" });

    const promotion = await root.run(async (ctx) =>
      ctx.db
        .query("promotions")
        .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
        .unique(),
    );
    expect(promotion?.status).toBe("paused");
  });

  it("restores active status when a cap-hitting redemption is released", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      maxRedemptions: 1,
      eligiblePlanTiers: ["plus"],
    });

    await expect(
      root
        .withIdentity({ subject: USER_ID })
        .action(api.functions.promotions.redeemPromotion, { code: "PROMO" }),
    ).rejects.toThrow(/not available for your current plan/);

    const promotion = await root.run(async (ctx) =>
      ctx.db
        .query("promotions")
        .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
        .unique(),
    );
    expect(promotion?.status).toBe("active");
    expect(promotion?.redeemedCount).toBe(0);
    expect(promotion?.autoStatusFromLimit).toBeUndefined();
  });

  it("preserves manual status when a redemption is released", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      maxRedemptions: 5,
      eligiblePlanTiers: ["plus"],
    });
    await root.run(async (ctx) => {
      const promo = await ctx.db
        .query("promotions")
        .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
        .unique();
      if (promo) {
        await ctx.db.patch(promo._id, { status: "paused" });
      }
    });

    await expect(
      root
        .withIdentity({ subject: USER_ID })
        .action(api.functions.promotions.redeemPromotion, { code: "PROMO" }),
    ).rejects.toThrow(/not active/);

    const promotion = await root.run(async (ctx) =>
      ctx.db
        .query("promotions")
        .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
        .unique(),
    );
    expect(promotion?.status).toBe("paused");
  });

  it("rejects gifted credit promotions for ineligible current plans", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      eligiblePlanTiers: ["plus"],
    });
    const user = root.withIdentity({ subject: USER_ID });

    await expect(
      user.action(api.functions.promotions.redeemPromotion, { code: "PROMO" }),
    ).rejects.toThrow(/not available for your current plan/);

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]).toMatchObject({
      status: "failed",
      failureReason: "This promotion is not available for your current plan.",
    });
  });

  it("tracks every repeated usage row", async () => {
    const root = testDb();
    const promotionId = await insertAppCreditPromotion(root, {
      perUserRedemptionLimit: 3,
    });
    const user = root.withIdentity({ subject: USER_ID });

    await user.action(api.functions.promotions.redeemPromotion, {
      code: "PROMO",
    });
    await user.action(api.functions.promotions.redeemPromotion, {
      code: "PROMO",
    });

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions.map((r) => r.status)).toEqual(["applied", "applied"]);
    expect(new Set(redemptions.map((r) => r.redemptionId)).size).toBe(2);
  });

  it("requires Checkout for full-discount subscription promotions that need a payment method", () => {
    expect(
      shouldCreateDirectSubscriptionForPromotion({
        mode: "gifted_subscription",
        freeUsersOnly: true,
        targetTiers: ["plus"],
        discount: { type: "percent", percentOff: 100 },
        duration: { type: "once" },
        requirePaymentMethod: true,
        cancelIfMissingPaymentMethodAtEnd: false,
      }),
    ).toBe(false);

    expect(
      shouldCreateDirectSubscriptionForPromotion({
        mode: "gifted_subscription",
        freeUsersOnly: true,
        targetTiers: ["plus"],
        discount: { type: "percent", percentOff: 100 },
        duration: { type: "once" },
        requirePaymentMethod: false,
        cancelIfMissingPaymentMethodAtEnd: true,
      }),
    ).toBe(true);
  });

  it("builds Stripe Checkout params for subscription promotions with an internal coupon", () => {
    const metadata = {
      kind: "promotion_subscription",
      promotionId: "promo-1",
      redemptionId: "redemption-1",
      userId: USER_ID,
      targetTier: "plus",
      tier: "plus",
      priceId: "price-plus",
      couponId: "coupon-1",
    };

    const params = buildPromotionSubscriptionCheckoutParams({
      siteUrl: "https://example.com",
      customerId: "cus_123",
      priceId: "price-plus",
      couponId: "coupon-1",
      promotionCode: "FREEPLUS",
      redemptionId: "redemption-1",
      userId: USER_ID,
      targetTier: "plus",
      metadata,
      requirePaymentMethod: true,
    });

    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_123",
      client_reference_id: USER_ID,
      line_items: [{ price: "price-plus", quantity: 1 }],
      discounts: [{ coupon: "coupon-1" }],
      payment_method_collection: "always",
      success_url:
        "https://example.com/redeem/FREEPLUS?checkout=success&redemptionId=redemption-1",
      cancel_url:
        "https://example.com/redeem/FREEPLUS?checkout=cancelled&redemptionId=redemption-1",
      metadata,
      subscription_data: { metadata },
    });
    expect(params).not.toHaveProperty("allow_promotion_codes");
  });

  it("URL-encodes promotion checkout redirect parameters", () => {
    const params = buildPromotionSubscriptionCheckoutParams({
      siteUrl: "https://example.com",
      customerId: "cus_123",
      priceId: "price-plus",
      couponId: "coupon-1",
      promotionCode: "SPRING/PLUS?#",
      redemptionId: "redemption/1?#",
      userId: USER_ID,
      targetTier: "plus",
      metadata: {
        kind: "promotion_subscription",
        promotionId: "promo-1",
        redemptionId: "redemption/1?#",
        userId: USER_ID,
        targetTier: "plus",
        tier: "plus",
        priceId: "price-plus",
        couponId: "coupon-1",
      },
      requirePaymentMethod: false,
    });

    expect(params.success_url).toBe(
      "https://example.com/redeem/SPRING%2FPLUS%3F%23?checkout=success&redemptionId=redemption%2F1%3F%23",
    );
    expect(params.cancel_url).toBe(
      "https://example.com/redeem/SPRING%2FPLUS%3F%23?checkout=cancelled&redemptionId=redemption%2F1%3F%23",
    );
  });

  it("builds stable Stripe idempotency keys for promotion writes", () => {
    expect(
      promotionStripeIdempotencyKey("invoice-credit", "redemption:with:colons"),
    ).toBe("redux-chat:promotion:invoice-credit:redemption_with_colons");
  });

  it("extends paid subscriber gift time after existing paid and trial time", () => {
    const nowMs = Date.UTC(2026, 0, 10);
    const existingTrialEndMs = Date.UTC(2026, 1, 5);
    const currentPeriodEndMs = Date.UTC(2026, 2, 15);

    expect(
      computePaidSubscriberPromotionFreeUntil({
        nowMs,
        existingTrialEndMs,
        currentPeriodEndMs,
        months: 2,
      }),
    ).toBe(Date.UTC(2026, 4, 15));
  });

  it("marks pending promotion checkout completed once and keeps duplicate webhooks idempotent", async () => {
    const root = testDb();
    const { promotionId, redemptionId } =
      await insertSubscriptionCheckoutRedemption(root, {
        status: "pending_checkout",
        stripeCheckoutSessionId: "cs_123",
      });

    await root.mutation(
      internal.functions.promotions.internal_markPromotionCheckoutCompleted,
      {
        redemptionId,
        userId: USER_ID,
        targetTier: "plus",
        stripeCustomerId: "cus_123",
        stripeSubscriptionId: "sub_123",
        stripeCheckoutSessionId: "cs_123",
        stripeCouponId: "coupon_123",
      },
    );
    await expect(
      root.mutation(
        internal.functions.promotions.internal_markPromotionCheckoutCompleted,
        {
          redemptionId,
          userId: USER_ID,
          targetTier: "plus",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_123",
          stripeCheckoutSessionId: "cs_123",
          stripeCouponId: "coupon_123",
        },
      ),
    ).resolves.toEqual({ ok: true });

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]).toMatchObject({
      status: "applied",
      stripeCustomerId: "cus_123",
      stripeSubscriptionId: "sub_123",
      stripeCheckoutSessionId: "cs_123",
      stripeCouponId: "coupon_123",
    });
  });

  it("rejects checkout completion after cancellation released the redemption", async () => {
    const root = testDb();
    const { promotionId, redemptionId } =
      await insertSubscriptionCheckoutRedemption(root, {
        status: "pending_checkout",
        stripeCheckoutSessionId: "cs_cancelled",
      });
    await root.mutation(
      internal.functions.promotions.internal_markPromotionRedemptionFailed,
      {
        redemptionId,
        userId: USER_ID,
        failureReason: "Checkout cancelled.",
        releaseRedemption: true,
        requirePendingCheckout: true,
        stripeCheckoutSessionId: "cs_cancelled",
      },
    );

    await expect(
      root.mutation(
        internal.functions.promotions.internal_markPromotionCheckoutCompleted,
        {
          redemptionId,
          userId: USER_ID,
          targetTier: "plus",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_123",
          stripeCheckoutSessionId: "cs_cancelled",
          stripeCouponId: "coupon_123",
        },
      ),
    ).rejects.toThrow(/not pending checkout/);

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions[0]).toMatchObject({
      status: "failed",
      failureReason: "Checkout cancelled.",
    });
  });

  it("releases a pending promotion checkout when Stripe marks it expired", async () => {
    const root = testDb();
    const { promotionId, redemptionId } =
      await insertSubscriptionCheckoutRedemption(root, {
        status: "pending_checkout",
        stripeCheckoutSessionId: "cs_expired",
      });

    await expect(
      root.mutation(
        internal.functions.promotions.internal_markPromotionRedemptionFailed,
        {
          redemptionId,
          userId: USER_ID,
          failureReason: "Checkout expired.",
          releaseRedemption: true,
          requirePendingCheckout: true,
          stripeCheckoutSessionId: "cs_expired",
        },
      ),
    ).resolves.toEqual({ ok: true });

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions[0]).toMatchObject({
      status: "failed",
      failureReason: "Checkout expired.",
    });

    const promotion = await root.run(async (ctx) =>
      ctx.db
        .query("promotions")
        .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
        .unique(),
    );
    expect(promotion?.redeemedCount).toBe(0);
  });

  it("ignores stale Stripe checkout expiration events for another session", async () => {
    const root = testDb();
    const { promotionId, redemptionId } =
      await insertSubscriptionCheckoutRedemption(root, {
        status: "pending_checkout",
        stripeCheckoutSessionId: "cs_current",
      });

    await expect(
      root.mutation(
        internal.functions.promotions.internal_markPromotionRedemptionFailed,
        {
          redemptionId,
          userId: USER_ID,
          failureReason: "Checkout expired.",
          releaseRedemption: true,
          requirePendingCheckout: true,
          stripeCheckoutSessionId: "cs_stale",
        },
      ),
    ).resolves.toEqual({ ok: true, skipped: true });

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions[0]).toMatchObject({
      status: "pending_checkout",
      stripeCheckoutSessionId: "cs_current",
    });

    const promotion = await root.run(async (ctx) =>
      ctx.db
        .query("promotions")
        .withIndex("by_promotionId", (q) => q.eq("promotionId", promotionId))
        .unique(),
    );
    expect(promotion?.redeemedCount).toBe(1);
  });

  it("rejects checkout completion for a different Stripe session", async () => {
    const root = testDb();
    const { redemptionId } = await insertSubscriptionCheckoutRedemption(root, {
      status: "pending_checkout",
      stripeCheckoutSessionId: "cs_expected",
    });

    await expect(
      root.mutation(
        internal.functions.promotions.internal_markPromotionCheckoutCompleted,
        {
          redemptionId,
          userId: USER_ID,
          targetTier: "plus",
          stripeCustomerId: "cus_123",
          stripeSubscriptionId: "sub_123",
          stripeCheckoutSessionId: "cs_other",
          stripeCouponId: "coupon_123",
        },
      ),
    ).rejects.toThrow(/checkout session mismatch/);
  });
});
