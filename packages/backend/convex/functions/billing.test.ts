import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const NOW = 1_700_000_000_000;

describe("functions/billing credit top-ups", () => {
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

  it("tracks the credit top-up intent lifecycle", async () => {
    const t = convexTest(schema, modules);

    const intent = await t.mutation(
      internal.functions.billing.internal_createCreditTopUpIntent,
      {
        userId: USER_ID,
        amountCents: 500,
        credits: 1_000_000,
      },
    );

    expect(intent).toMatchObject({
      userId: USER_ID,
      amountCents: 500,
      currency: "usd",
      credits: 1_000_000,
      status: "created",
      createdAt: NOW,
      updatedAt: NOW,
    });

    await t.mutation(
      internal.functions.billing.internal_markCreditTopUpCheckoutCreated,
      {
        intentId: intent.intentId,
        userId: USER_ID,
        polarCheckoutId: "checkout-1",
      },
    );

    await expect(
      t.query(
        internal.functions.billing.internal_getCreditTopUpIntentByIntentId,
        { intentId: intent.intentId },
      ),
    ).resolves.toMatchObject({
      status: "checkout_created",
      polarCheckoutId: "checkout-1",
    });

    await expect(
      t.mutation(
        internal.functions.billing.internal_markCreditTopUpIntentPaid,
        {
          intentId: intent.intentId,
          userId: USER_ID,
          polarOrderId: "order-1",
          polarCheckoutId: "checkout-1",
        },
      ),
    ).resolves.toEqual({ ok: true, alreadyPaid: false });

    await expect(
      t.mutation(
        internal.functions.billing.internal_markCreditTopUpIntentPaid,
        {
          intentId: intent.intentId,
          userId: USER_ID,
          polarOrderId: "order-1",
          polarCheckoutId: "checkout-1",
        },
      ),
    ).resolves.toEqual({ ok: true, alreadyPaid: true });
  });

  it("grants top-up credits into the paid bucket without expiry idempotently", async () => {
    const t = convexTest(schema, modules);

    await t.mutation(internal.functions.credits.internal_grantCredits, {
      userId: USER_ID,
      bucket: "paid",
      amount: 1_000_000,
      source: "polar_one_time_purchase",
      sourceId: "order-1",
      metadata: {
        intentId: "intent-1",
        amountCents: 500,
      },
    });

    await t.mutation(internal.functions.credits.internal_grantCredits, {
      userId: USER_ID,
      bucket: "paid",
      amount: 1_000_000,
      source: "polar_one_time_purchase",
      sourceId: "order-1",
      metadata: {
        intentId: "intent-1",
        amountCents: 500,
      },
    });

    const balance = await t.query(
      internal.functions.credits.internal_getBalance,
      { userId: USER_ID },
    );

    expect(balance.bucketBalances.paid).toBe(1_000_000);
    expect(balance.spendableCredits).toBe(1_000_000);
    expect(balance.expiringSoon).toEqual([]);
  });
});
