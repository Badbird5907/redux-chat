import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

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
    maxRedemptions?: number;
    perUserRedemptionLimit?: number;
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
      redeemedCount: 0,
      createdByUserId: "admin",
      createdAt: NOW,
      updatedAt: NOW,
      metadata: {
        config: {
          amount: args.amount ?? 100,
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
    ).rejects.toThrow(/redemption limit/);

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
    ).rejects.toThrow(/redemption limit/);

    const redemptions = await listRedemptions(root, promotionId);
    expect(redemptions).toHaveLength(1);
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
});
