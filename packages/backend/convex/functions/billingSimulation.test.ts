import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const PERIOD_START = Date.UTC(2024, 0, 1);
const PERIOD_END = Date.UTC(2024, 1, 1);

describe("billing simulation mutations", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CONVEX_SECRET", "test-internal-secret");
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.useFakeTimers();
    vi.setSystemTime(PERIOD_START + 1_000);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("activates Plus by revoking free credits and creating a distinct grant", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      internal.functions.credits.internal_ensureMonthlyFreeCredits,
      { userId: USER_ID, tier: "free" },
    );

    await t.mutation(
      internal.functions.billingSimulation.internal_setBillingSimulation,
      {
        userId: USER_ID,
        tier: "plus",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        amount: 1_000_000,
      },
    );

    const state = await t.query(
      internal.functions.billingSimulation.internal_getBillingSimulation,
      { userId: USER_ID },
    );
    expect(state.override).toMatchObject({
      userId: USER_ID,
      tier: "plus",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
    });

    const grants = await t.run(async (ctx) =>
      ctx.db
        .query("creditGrants")
        .withIndex("by_user_granted_at", (q) => q.eq("userId", USER_ID))
        .collect(),
    );
    expect(grants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "free_monthly_reset",
          status: "revoked",
          remaining: 0,
        }),
        expect.objectContaining({
          source: "billing_simulation",
          sourceId: "billing-simulation:user-1:2024-01",
          amount: 1_000_000,
          remaining: 1_000_000,
          status: "active",
        }),
      ]),
    );
  });

  it("resets simulation, revokes only its grant, and restores free credits", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      internal.functions.billingSimulation.internal_setBillingSimulation,
      {
        userId: USER_ID,
        tier: "pro",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        amount: 3_500_000,
      },
    );
    await t.mutation(
      internal.functions.billingSimulation.internal_clearBillingSimulation,
      { userId: USER_ID, restoreFreeGrant: true },
    );

    const state = await t.query(
      internal.functions.billingSimulation.internal_getBillingSimulation,
      { userId: USER_ID },
    );
    expect(state.override).toBeNull();

    const grants = await t.run(async (ctx) =>
      ctx.db
        .query("creditGrants")
        .withIndex("by_user_granted_at", (q) => q.eq("userId", USER_ID))
        .collect(),
    );
    expect(
      grants.find((grant) => grant.source === "billing_simulation"),
    ).toMatchObject({ status: "revoked", remaining: 0 });
    expect(
      grants.find((grant) => grant.source === "free_monthly_reset"),
    ).toMatchObject({ status: "active", remaining: 100_000 });
  });

  it("lazily cleans an expired override and restores free credits", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      internal.functions.billingSimulation.internal_setBillingSimulation,
      {
        userId: USER_ID,
        tier: "plus",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        amount: 1_000_000,
      },
    );
    vi.setSystemTime(PERIOD_END + 1);

    await expect(
      t.mutation(
        internal.functions.billingSimulation
          .internal_cleanupExpiredBillingSimulation,
        { userId: USER_ID, restoreFreeGrant: true },
      ),
    ).resolves.toEqual({ cleaned: true });

    const state = await t.query(
      internal.functions.billingSimulation.internal_getBillingSimulation,
      { userId: USER_ID },
    );
    expect(state.override).toBeNull();
    const balance = await t.query(
      internal.functions.credits.internal_getBalance,
      { userId: USER_ID },
    );
    expect(balance.bucketBalances.monthly).toBe(100_000);
  });

  it("cleans an override when simulation is disabled before period end", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(
      internal.functions.billingSimulation.internal_setBillingSimulation,
      {
        userId: USER_ID,
        tier: "plus",
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        amount: 1_000_000,
      },
    );

    await expect(
      t.mutation(
        internal.functions.billingSimulation
          .internal_cleanupExpiredBillingSimulation,
        { userId: USER_ID, restoreFreeGrant: true },
      ),
    ).resolves.toEqual({ cleaned: true });

    const state = await t.query(
      internal.functions.billingSimulation.internal_getBillingSimulation,
      { userId: USER_ID },
    );
    expect(state.override).toBeNull();
  });
});
