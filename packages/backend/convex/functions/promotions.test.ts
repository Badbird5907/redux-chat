import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const NOW = 1_700_000_000_000;

function testWithUser(userId = USER_ID) {
  return convexTest(schema, modules).withIdentity({ subject: userId });
}

async function createGiftedPromo(
  t: ReturnType<typeof testWithUser>,
  overrides: Record<string, unknown> = {},
) {
  return await t.mutation(
    internal.functions.promotions.internal_createPromotionRecord,
    {
      code: "GIFT100",
      codeNormalized: "GIFT100",
      name: "Gift 100",
      type: "gifted_credits",
      status: "active",
      createdByUserId: "admin",
      creditAmount: 100,
      creditExpiryPolicy: { type: "none" },
      ...overrides,
    },
  );
}

async function createSubscriptionPromo(
  t: ReturnType<typeof testWithUser>,
  overrides: Record<string, unknown> = {},
) {
  return await t.mutation(
    internal.functions.promotions.internal_createPromotionRecord,
    {
      code: "SAVE20",
      codeNormalized: "SAVE20",
      name: "Save 20",
      type: "subscription_discount",
      status: "active",
      createdByUserId: "admin",
      eligibleTiers: ["plus", "pro"],
      discountType: "percentage",
      percentBasisPoints: 2000,
      duration: "once",
      polarDiscountId: "discount-1",
      polarDiscountCode: "SAVE20",
      ...overrides,
    },
  );
}

describe("functions/promotions", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CONVEX_SECRET", "test-internal-secret");
    vi.stubEnv("SITE_URL", "https://example.com");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("POLAR_PLUS_PRODUCT_ID", "plus-product");
    vi.stubEnv("POLAR_PRO_PRODUCT_ID", "pro-product");
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("redeems a gifted promotion once for a user", async () => {
    const t = testWithUser();
    await createGiftedPromo(t);

    await expect(
      t.mutation(api.functions.promotions.redeemGiftedCreditsPromotion, {
        code: "gift100",
      }),
    ).resolves.toMatchObject({ status: "applied", amount: 100 });

    await expect(
      t.mutation(api.functions.promotions.redeemGiftedCreditsPromotion, {
        code: "GIFT100",
      }),
    ).resolves.toMatchObject({ status: "already_redeemed" });
  });

  it("enforces gifted promotion max redemptions across users", async () => {
    const root = convexTest(schema, modules);
    const user = root.withIdentity({ subject: USER_ID });
    const other = root.withIdentity({ subject: OTHER_USER_ID });
    await createGiftedPromo(user, { maxRedemptions: 1 });

    await user.mutation(api.functions.promotions.redeemGiftedCreditsPromotion, {
      code: "GIFT100",
    });
    await expect(
      other.mutation(api.functions.promotions.redeemGiftedCreditsPromotion, {
        code: "GIFT100",
      }),
    ).rejects.toThrow(/full/);
  });

  it("enforces promotion start and end windows", async () => {
    const t = testWithUser();
    await createGiftedPromo(t, {
      code: "FUTURE",
      codeNormalized: "FUTURE",
      startsAt: NOW + 60_000,
    });

    await expect(
      t.mutation(api.functions.promotions.redeemGiftedCreditsPromotion, {
        code: "FUTURE",
      }),
    ).rejects.toThrow(/not_started/);
  });

  it("computes relative gifted credit expiry from redemption time", async () => {
    const t = testWithUser();
    await createGiftedPromo(t, {
      creditExpiryPolicy: { type: "relative", days: 7 },
    });

    await t.mutation(api.functions.promotions.redeemGiftedCreditsPromotion, {
      code: "GIFT100",
    });

    const grants = await t.query(
      internal.functions.credits.internal_getBalance,
      {
        userId: USER_ID,
      },
    );
    expect(grants.expiringSoon).toEqual([
      expect.objectContaining({ expiresAt: NOW + 7 * 86_400_000 }),
    ]);
  });

  it("allows subscription checkout retries before confirmation", async () => {
    const t = testWithUser();
    await createSubscriptionPromo(t);

    await expect(
      t.mutation(
        internal.functions.promotions
          .internal_prepareSubscriptionCheckoutRedemption,
        { code: "save20", tier: "plus", userId: USER_ID },
      ),
    ).resolves.toMatchObject({ productId: "plus-product" });

    await expect(
      t.mutation(
        internal.functions.promotions
          .internal_prepareSubscriptionCheckoutRedemption,
        { code: "SAVE20", tier: "plus", userId: USER_ID },
      ),
    ).resolves.toMatchObject({ productId: "plus-product" });
  });

  it("prepares 100% once subscription promos for a one month trial checkout", async () => {
    const t = testWithUser();
    await createSubscriptionPromo(t, {
      percentBasisPoints: 10_000,
      duration: "once",
    });

    await expect(
      t.mutation(
        internal.functions.promotions
          .internal_prepareSubscriptionCheckoutRedemption,
        { code: "SAVE20", tier: "plus", userId: USER_ID },
      ),
    ).resolves.toMatchObject({
      discountType: "percentage",
      percentBasisPoints: 10_000,
      duration: "once",
      subscriptionTrial: {
        trialInterval: "month",
        trialIntervalCount: 1,
      },
    });
  });

  it("prepares 100% repeating subscription promos for a matching month trial checkout", async () => {
    const t = testWithUser();
    await createSubscriptionPromo(t, {
      percentBasisPoints: 10_000,
      duration: "repeating",
      durationInMonths: 3,
    });

    await expect(
      t.mutation(
        internal.functions.promotions
          .internal_prepareSubscriptionCheckoutRedemption,
        { code: "SAVE20", tier: "plus", userId: USER_ID },
      ),
    ).resolves.toMatchObject({
      discountType: "percentage",
      percentBasisPoints: 10_000,
      duration: "repeating",
      durationInMonths: 3,
      subscriptionTrial: {
        trialInterval: "month",
        trialIntervalCount: 3,
      },
    });
  });

  it("keeps 100% forever subscription promos on the discount path", async () => {
    const t = testWithUser();
    await createSubscriptionPromo(t, {
      percentBasisPoints: 10_000,
      duration: "forever",
    });

    await expect(
      t.mutation(
        internal.functions.promotions
          .internal_prepareSubscriptionCheckoutRedemption,
        { code: "SAVE20", tier: "plus", userId: USER_ID },
      ),
    ).resolves.toMatchObject({
      polarDiscountId: "discount-1",
      discountType: "percentage",
      percentBasisPoints: 10_000,
      duration: "forever",
    });
  });

  it("blocks subscription redemption after confirmed payment and increments once", async () => {
    const t = testWithUser();
    const promo = await createSubscriptionPromo(t, { maxRedemptions: 1 });
    const prepared = await t.mutation(
      internal.functions.promotions
        .internal_prepareSubscriptionCheckoutRedemption,
      { code: "SAVE20", tier: "pro", userId: USER_ID },
    );

    await expect(
      t.mutation(
        internal.functions.promotions
          .internal_confirmSubscriptionPromotionRedemption,
        {
          promotionId: promo.promotionId,
          redemptionId: prepared.redemptionId,
          userId: USER_ID,
          polarOrderId: "order-1",
          polarSubscriptionId: "sub-1",
        },
      ),
    ).resolves.toEqual({ ok: true, alreadyConfirmed: false });

    await expect(
      t.mutation(
        internal.functions.promotions
          .internal_confirmSubscriptionPromotionRedemption,
        {
          promotionId: promo.promotionId,
          redemptionId: prepared.redemptionId,
          userId: USER_ID,
          polarOrderId: "order-1",
          polarSubscriptionId: "sub-1",
        },
      ),
    ).resolves.toEqual({ ok: true, alreadyConfirmed: true });

    await expect(
      t.mutation(
        internal.functions.promotions
          .internal_prepareSubscriptionCheckoutRedemption,
        { code: "SAVE20", tier: "pro", userId: USER_ID },
      ),
    ).rejects.toThrow(/full|already/);

    const row = await t.query(
      internal.functions.promotions.internal_getPromotionByNormalizedCode,
      { codeNormalized: "SAVE20" },
    );
    expect(row).not.toBeNull();
    if (!row) {
      throw new Error("Promotion not found");
    }
    expect(row.redemptionCount).toBe(1);
  });

  it("rejects paused and archived promotions", async () => {
    const t = testWithUser();
    await createGiftedPromo(t, { status: "paused" });

    await expect(
      t.mutation(api.functions.promotions.redeemGiftedCreditsPromotion, {
        code: "GIFT100",
      }),
    ).rejects.toThrow(/paused/);
  });
});
