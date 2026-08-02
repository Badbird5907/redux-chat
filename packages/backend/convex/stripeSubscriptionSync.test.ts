import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { components, internal } from "./_generated/api";
import {
  revokeStripeSubscriptionAllowance,
  syncStripeCheckoutSessionRecord,
  syncStripeLatestInvoice,
  syncStripeSubscriptionAllowance,
  upsertStripeSubscriptionRecord,
} from "./stripeSubscriptionSync";

const USER_ID = "user-1";

function subscription(
  overrides: Partial<Stripe.Subscription> = {},
): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    created: 1_700_000_000,
    customer: "cus_1",
    status: "active",
    cancel_at_period_end: false,
    cancel_at: null,
    metadata: { userId: USER_ID },
    items: {
      object: "list",
      data: [
        {
          id: "si_1",
          object: "subscription_item",
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: { id: "price_plus", object: "price" },
          quantity: 1,
        },
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function mutationContext() {
  return {
    runMutation: vi.fn((_reference: unknown, _args: unknown) =>
      Promise.resolve({ revoked: 1 }),
    ),
  };
}

describe("shared Stripe subscription synchronization", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", "price_plus");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("creates before updating the Stripe component subscription record", async () => {
    const ctx = mutationContext();
    await upsertStripeSubscriptionRecord(
      ctx as Parameters<typeof upsertStripeSubscriptionRecord>[0],
      subscription(),
    );

    expect(ctx.runMutation).toHaveBeenNthCalledWith(
      1,
      components.stripe.private.handleSubscriptionCreated,
      expect.objectContaining({
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        status: "active",
        priceId: "price_plus",
      }),
    );
    expect(ctx.runMutation).toHaveBeenNthCalledWith(
      2,
      components.stripe.private.handleSubscriptionUpdated,
      expect.objectContaining({
        stripeSubscriptionId: "sub_1",
        status: "active",
        priceId: "price_plus",
      }),
    );
  });

  it("uses a stable subscription-period allowance key on duplicate sync", async () => {
    const ctx = mutationContext();
    const sub = subscription();
    await syncStripeSubscriptionAllowance(
      ctx as Parameters<typeof syncStripeSubscriptionAllowance>[0],
      sub,
    );
    await syncStripeSubscriptionAllowance(
      ctx as Parameters<typeof syncStripeSubscriptionAllowance>[0],
      sub,
    );

    const upsertCalls = ctx.runMutation.mock.calls.filter(
      ([, args]) =>
        typeof args === "object" &&
        args !== null &&
        "sourceId" in args &&
        args.sourceId === "sub_1:1700000000000",
    );
    expect(upsertCalls).toHaveLength(2);
    expect(upsertCalls[0]?.[1]).toMatchObject({
      userId: USER_ID,
      sourceId: "sub_1:1700000000000",
      periodKey: "2023-11",
      expiresAt: 1_702_592_000_000,
    });
    expect(upsertCalls[1]?.[1]).toEqual(upsertCalls[0]?.[1]);
  });

  it("clears simulation before granting a real subscription allowance", async () => {
    const ctx = mutationContext();
    await syncStripeSubscriptionAllowance(
      ctx as Parameters<typeof syncStripeSubscriptionAllowance>[0],
      subscription(),
    );

    expect(ctx.runMutation).toHaveBeenNthCalledWith(
      1,
      internal.functions.billingSimulation.internal_clearBillingSimulation,
      {
        userId: USER_ID,
        restoreFreeGrant: false,
        reason: "real_subscription_activated",
      },
    );
    expect(ctx.runMutation.mock.calls[1]?.[1]).toEqual({
      userId: USER_ID,
      reason: "upgraded_to_paid",
    });
    expect(ctx.runMutation.mock.calls[2]?.[1]).toMatchObject({
      userId: USER_ID,
      sourceId: "sub_1:1700000000000",
    });
  });

  it("revokes only the requested non-selected subscription allowance", async () => {
    const ctx = mutationContext();
    await revokeStripeSubscriptionAllowance(
      ctx as Parameters<typeof revokeStripeSubscriptionAllowance>[0],
      subscription(),
      "stripe_subscription_not_selected",
      false,
    );
    expect(ctx.runMutation.mock.calls.map(([, args]) => args)).toEqual([
      {
        userId: USER_ID,
        subscriptionId: "sub_1",
        reason: "stripe_subscription_not_selected",
      },
    ]);
  });

  it("records a completed Checkout Session idempotently through the component", async () => {
    const ctx = mutationContext();
    const session = {
      id: "cs_1",
      mode: "subscription",
      customer: "cus_1",
      metadata: { userId: USER_ID },
    } as unknown as Stripe.Checkout.Session;
    await syncStripeCheckoutSessionRecord(
      ctx as Parameters<typeof syncStripeCheckoutSessionRecord>[0],
      session,
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      components.stripe.private.handleCheckoutSessionCompleted,
      {
        stripeCheckoutSessionId: "cs_1",
        stripeCustomerId: "cus_1",
        mode: "subscription",
        metadata: { userId: USER_ID },
      },
    );
  });

  it("synchronizes an expanded latest invoice and its paid status", async () => {
    const ctx = mutationContext();
    const invoice = {
      id: "in_1",
      object: "invoice",
      customer: "cus_1",
      status: "paid",
      amount_due: 1200,
      amount_paid: 1200,
      created: 1_700_000_100,
    } as Stripe.Invoice;
    const stripe = {
      invoices: { retrieve: vi.fn() },
    } as unknown as Stripe;

    await syncStripeLatestInvoice(
      ctx as Parameters<typeof syncStripeLatestInvoice>[0],
      stripe,
      subscription({ latest_invoice: invoice }),
    );

    expect(ctx.runMutation).toHaveBeenCalledWith(
      components.stripe.private.handleInvoiceCreated,
      {
        stripeInvoiceId: "in_1",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        status: "paid",
        amountDue: 1200,
        amountPaid: 1200,
        created: 1_700_000_100,
      },
    );
    expect(ctx.runMutation).toHaveBeenCalledWith(
      components.stripe.private.handleInvoicePaid,
      { stripeInvoiceId: "in_1", amountPaid: 1200 },
    );
  });
});
