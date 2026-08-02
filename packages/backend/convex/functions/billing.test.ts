import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";
import { selectEffectiveSubscriptionState } from "./billing";

const USER_ID = "user-1";
const NOW = 1_700_000_000_000;

describe("billing subscription precedence", () => {
  const simulationState = {
    available: true,
    active: true,
    override: {
      tier: "plus" as const,
      periodStart: NOW,
      periodEnd: NOW + 1_000,
    },
  };

  it("keeps an actual paid subscription ahead of an active simulation", () => {
    const actualState = {
      tier: "pro" as const,
      subscription: {
        subscriptionId: "sub_real",
        priceId: "price_pro",
        status: "active",
      },
      billingMode: "actual" as const,
    };

    expect(selectEffectiveSubscriptionState(actualState, simulationState)).toBe(
      actualState,
    );
  });

  it("uses active simulation only when actual billing is free", () => {
    expect(
      selectEffectiveSubscriptionState(
        { tier: "free", subscription: null, billingMode: "actual" },
        simulationState,
      ),
    ).toMatchObject({
      tier: "plus",
      subscription: null,
      billingMode: "simulation",
      simulation: simulationState.override,
    });
  });
});

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
        stripeCheckoutSessionId: "checkout-1",
      },
    );

    await expect(
      t.query(
        internal.functions.billing.internal_getCreditTopUpIntentByIntentId,
        { intentId: intent.intentId },
      ),
    ).resolves.toMatchObject({
      status: "checkout_created",
      stripeCheckoutSessionId: "checkout-1",
    });

    await expect(
      t.mutation(
        internal.functions.billing.internal_markCreditTopUpIntentPaid,
        {
          intentId: intent.intentId,
          userId: USER_ID,
          stripePaymentIntentId: "order-1",
          stripeCheckoutSessionId: "checkout-1",
        },
      ),
    ).resolves.toEqual({ ok: true, alreadyPaid: false });

    await expect(
      t.mutation(
        internal.functions.billing.internal_markCreditTopUpIntentPaid,
        {
          intentId: intent.intentId,
          userId: USER_ID,
          stripePaymentIntentId: "order-1",
          stripeCheckoutSessionId: "checkout-1",
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
      source: "stripe_one_time_purchase",
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
      source: "stripe_one_time_purchase",
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
