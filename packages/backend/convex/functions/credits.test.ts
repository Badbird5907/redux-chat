import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  debitCreditsTx,
  ensureFreeMonthlyCreditsAfterPaidCancellationTx,
  getCreditBalanceForUser,
  grantCreditsTx,
  paginateSortedCreditGrantHistory,
  revokeCreditGrantForUserTx,
  revokeFreeMonthlyCreditsTx,
  revokeSubscriptionMonthlyCreditsTx,
  sortCreditGrantHistory,
  sweepExpiredGrantsTx,
  upsertSubscriptionMonthlyCreditsTx,
} from "../credits";
import schema from "../schema";
import { modules } from "../test.setup";

// convex-test exposes `t.run(handler)` which gives us a real `MutationCtx` so
// we can drive the pure helpers in `credits.ts` without going through the
// auth-bound `mutation` wrappers (which need a user identity).

const USER_ID = "user-1";
const NOW = 1_700_000_000_000;

describe("credit ledger helpers", () => {
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

  it("orders grant history with active grants first, newest grants first", () => {
    const sorted = sortCreditGrantHistory([
      { grantId: "revoked-new", grantedAt: NOW + 3000, status: "revoked" },
      { grantId: "active-old", grantedAt: NOW + 1000, status: "active" },
      { grantId: "exhausted", grantedAt: NOW + 4000, status: "exhausted" },
      { grantId: "active-new", grantedAt: NOW + 2000, status: "active" },
    ]);

    expect(sorted.map((grant) => grant.grantId)).toEqual([
      "active-new",
      "active-old",
      "exhausted",
      "revoked-new",
    ]);

    expect(
      paginateSortedCreditGrantHistory(sorted, {
        cursor: "1",
        numItems: 2,
      }),
    ).toMatchObject({
      page: [
        { grantId: "active-old" },
        { grantId: "exhausted" },
      ],
      isDone: false,
      continueCursor: "3",
    });
  });

  it("grants are idempotent on (source, sourceId)", async () => {
    const t = convexTest(schema, modules);

    const first = await t.run(async (ctx) =>
      grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 100,
        source: "free_monthly_reset",
        sourceId: `${USER_ID}:2024-01`,
      }),
    );

    const second = await t.run(async (ctx) =>
      grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 100,
        source: "free_monthly_reset",
        sourceId: `${USER_ID}:2024-01`,
      }),
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.grantId).toBe(first.grantId);
  });

  it("adjusts same-period subscription allowance when a paid plan upgrades", async () => {
    const t = convexTest(schema, modules);
    const sourceId = "sub-1:1700000000000";

    await t.run(async (ctx) => {
      await upsertSubscriptionMonthlyCreditsTx(ctx, {
        userId: USER_ID,
        amount: 1_000_000,
        sourceId,
        periodKey: "2023-11",
        expiresAt: NOW + 86_400_000,
        metadata: { subscriptionId: "sub-1", tier: "plus" },
      });
      await debitCreditsTx(ctx, {
        userId: USER_ID,
        requestKey: "msg-uses-plus",
        amount: 250_000,
        overageAllowed: false,
      });
    });

    const adjusted = await t.run(async (ctx) =>
      upsertSubscriptionMonthlyCreditsTx(ctx, {
        userId: USER_ID,
        amount: 3_500_000,
        sourceId,
        periodKey: "2023-11",
        expiresAt: NOW + 86_400_000,
        metadata: { subscriptionId: "sub-1", tier: "pro" },
      }),
    );

    expect(adjusted.created).toBe(false);
    expect(adjusted.adjusted).toBe(true);
    expect(adjusted.previousAmount).toBe(1_000_000);
    expect(adjusted.previousRemaining).toBe(750_000);

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.bucketBalances.monthly).toBe(3_250_000);
    expect(balance.spendableCredits).toBe(3_250_000);
  });

  it("debits allocate gifted → monthly → paid", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "paid",
        amount: 100,
        source: "stripe_one_time_purchase",
        sourceId: "order-1",
      });
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 200,
        source: "stripe_subscription_renewal",
        sourceId: "sub-1:0",
      });
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "gifted",
        amount: 100,
        source: "admin_grant",
        sourceId: "promo-1",
      });
    });

    const debit = await t.run(async (ctx) =>
      debitCreditsTx(ctx, {
        userId: USER_ID,
        requestKey: "msg-1",
        amount: 250,
        overageAllowed: false,
      }),
    );

    expect(debit.allocations.map((a) => a.bucket)).toEqual([
      "gifted",
      "monthly",
    ]);
    expect(debit.allocatedAmount).toBe(250);
    expect(debit.overdraftAmount).toBe(0);

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.spendableCredits).toBe(150);
    expect(balance.bucketBalances).toEqual({
      gifted: 0,
      monthly: 50,
      paid: 100,
    });
  });

  it("debits are idempotent on requestKey", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 100,
        source: "free_monthly_reset",
        sourceId: `${USER_ID}:2024-01`,
      });
    });

    const first = await t.run(async (ctx) =>
      debitCreditsTx(ctx, {
        userId: USER_ID,
        requestKey: "msg-1",
        amount: 30,
        overageAllowed: false,
      }),
    );
    const second = await t.run(async (ctx) =>
      debitCreditsTx(ctx, {
        userId: USER_ID,
        requestKey: "msg-1",
        amount: 30,
        overageAllowed: false,
      }),
    );

    expect(first.alreadyApplied).toBe(false);
    expect(second.alreadyApplied).toBe(true);
    expect(second.debitId).toBe(first.debitId);

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.spendableCredits).toBe(70);
  });

  it("debit throws INSUFFICIENT_CREDITS when overage disallowed and balance is too low", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 5,
        source: "free_monthly_reset",
        sourceId: `${USER_ID}:2024-01`,
      });
    });

    await expect(
      t.run(async (ctx) =>
        debitCreditsTx(ctx, {
          userId: USER_ID,
          requestKey: "msg-too-big",
          amount: 1000,
          overageAllowed: false,
        }),
      ),
    ).rejects.toThrow(/INSUFFICIENT_CREDITS/);

    // Failed debit must not consume any grant.
    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.spendableCredits).toBe(5);
  });

  it("debit records overdraft when overage is allowed", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 50,
        source: "stripe_subscription_renewal",
        sourceId: "sub-1:0",
      });
    });

    const debit = await t.run(async (ctx) =>
      debitCreditsTx(ctx, {
        userId: USER_ID,
        requestKey: "msg-overdraft",
        amount: 200,
        overageAllowed: true,
      }),
    );

    expect(debit.allocatedAmount).toBe(50);
    expect(debit.overdraftAmount).toBe(150);

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.spendableCredits).toBe(0);
  });

  it("expired grants are excluded from balance and swept", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 100,
        source: "stripe_subscription_renewal",
        sourceId: "sub-1:0",
        expiresAt: NOW - 1,
      });
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 25,
        source: "free_monthly_reset",
        sourceId: `${USER_ID}:2024-01`,
      });
    });

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.spendableCredits).toBe(25);

    const swept = await t.run(async (ctx) =>
      sweepExpiredGrantsTx(ctx, USER_ID),
    );
    expect(swept.expired).toBe(1);
  });

  it("force-cancel revokes paid monthly subscription grants only", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 1_000_000,
        source: "stripe_subscription_renewal",
        sourceId: "sub_paid_1:1700000000000",
        metadata: { subscriptionId: "sub_paid_1" },
      });
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 100_000,
        source: "free_monthly_reset",
        sourceId: `${USER_ID}:2024-01`,
      });
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "gifted",
        amount: 500,
        source: "admin_grant",
        sourceId: "promo-keep",
      });
    });

    const revoke = await t.run(async (ctx) =>
      revokeSubscriptionMonthlyCreditsTx(ctx, {
        userId: USER_ID,
        subscriptionId: "sub_paid_1",
        reason: "subscription.canceled",
      }),
    );
    expect(revoke.revoked).toBe(1);

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.bucketBalances).toEqual({
      gifted: 500,
      monthly: 100_000,
      paid: 0,
    });
    expect(balance.spendableCredits).toBe(100_500);
  });

  it("paid upgrade revokes free-monthly grants only", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 100_000,
        source: "free_monthly_reset",
        sourceId: `${USER_ID}:2024-01`,
      });
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 1_000_000,
        source: "stripe_subscription_renewal",
        sourceId: "sub_plus_1:1700000000000",
      });
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "paid",
        amount: 1_000,
        source: "stripe_one_time_purchase",
        sourceId: "order-keep",
      });
    });

    const revoke = await t.run(async (ctx) =>
      revokeFreeMonthlyCreditsTx(ctx, {
        userId: USER_ID,
        reason: "upgraded_to_paid",
      }),
    );
    expect(revoke.revoked).toBe(1);

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.bucketBalances).toEqual({
      gifted: 0,
      monthly: 1_000_000,
      paid: 1_000,
    });
    expect(balance.spendableCredits).toBe(1_001_000);
  });

  it("paid cancellation reactivates a revoked free monthly grant for the current month", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "monthly",
        amount: 100_000,
        source: "free_monthly_reset",
        sourceId: `${USER_ID}:2023-11`,
        periodKey: "2023-11",
      });
      await revokeFreeMonthlyCreditsTx(ctx, {
        userId: USER_ID,
        reason: "upgraded_to_paid",
      });
    });

    const restored = await t.run(async (ctx) =>
      ensureFreeMonthlyCreditsAfterPaidCancellationTx(ctx, {
        userId: USER_ID,
        reason: "customer.subscription.deleted",
      }),
    );

    expect(restored).toMatchObject({
      created: false,
      reactivated: true,
      amount: 100_000,
      bucket: "monthly",
    });

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.bucketBalances.monthly).toBe(100_000);
    expect(balance.spendableCredits).toBe(100_000);
  });

  it("paid cancellation creates a current free monthly grant when none exists", async () => {
    const t = convexTest(schema, modules);

    const created = await t.run(async (ctx) =>
      ensureFreeMonthlyCreditsAfterPaidCancellationTx(ctx, {
        userId: USER_ID,
        reason: "customer.subscription.deleted",
      }),
    );

    expect(created).toMatchObject({
      created: true,
      reactivated: false,
      amount: 100_000,
      bucket: "monthly",
    });

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.bucketBalances.monthly).toBe(100_000);
    expect(balance.spendableCredits).toBe(100_000);
  });

  it("admin single-grant revoke removes remaining balance", async () => {
    const t = convexTest(schema, modules);

    const created = await t.run(async (ctx) =>
      grantCreditsTx(ctx, {
        userId: USER_ID,
        bucket: "gifted",
        amount: 500,
        source: "admin_grant",
        sourceId: "admin:test-single-revoke",
      }),
    );

    await t.run(async (ctx) => {
      await revokeCreditGrantForUserTx(ctx, {
        userId: USER_ID,
        grantId: created.grantId,
      });
    });

    const balance = await t.run(async (ctx) =>
      getCreditBalanceForUser(ctx, USER_ID),
    );
    expect(balance.spendableCredits).toBe(0);
  });
});
