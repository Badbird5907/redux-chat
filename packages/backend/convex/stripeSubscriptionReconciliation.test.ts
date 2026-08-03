import type Stripe from "stripe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadStripeSubscriptionsForReconciliation,
  selectBestLiveStripeSubscription,
} from "./stripeSubscriptionReconciliation";

const USER_ID = "user-1";
const CUSTOMER_ID = "cus_1";

function subscription(
  id: string,
  args: {
    priceId?: string;
    status?: Stripe.Subscription.Status;
    userId?: string;
    created?: number;
    metadata?: Stripe.Metadata;
  } = {},
): Stripe.Subscription {
  return {
    id,
    object: "subscription",
    created: args.created ?? 100,
    customer: CUSTOMER_ID,
    status: args.status ?? "active",
    cancel_at_period_end: false,
    metadata: args.metadata ?? { userId: args.userId ?? USER_ID },
    items: {
      object: "list",
      data: [
        {
          id: "si_" + id,
          object: "subscription_item",
          current_period_start: 1_700_000_000,
          current_period_end: 1_702_592_000,
          price: { id: args.priceId ?? "price_plus", object: "price" },
          quantity: 1,
        },
      ],
      has_more: false,
      url: "/v1/subscription_items",
    },
  } as unknown as Stripe.Subscription;
}

function checkoutSession(
  sub: Stripe.Subscription | string | null,
  overrides: Partial<Stripe.Checkout.Session> = {},
): Stripe.Checkout.Session {
  return {
    id: "cs_1",
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    customer: CUSTOMER_ID,
    metadata: { userId: USER_ID },
    subscription: sub,
    ...overrides,
  } as Stripe.Checkout.Session;
}

function clientFor(session: Stripe.Checkout.Session) {
  return {
    retrieveCheckoutSession: vi.fn(() => Promise.resolve(session)),
    retrieveSubscription: vi.fn((id: string) =>
      Promise.resolve(subscription(id)),
    ),
    listSubscriptions: vi.fn(() => Promise.resolve([])),
    updateSubscriptionMetadata: vi.fn(() => Promise.resolve()),
  };
}

describe("Stripe subscription reconciliation loading", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("STRIPE_BASE_PRICE_ID", "price_base");
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", "price_plus");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(["paid", "no_payment_required"] as const)(
    "accepts a completed %s subscription Checkout",
    async (paymentStatus) => {
      const sub = subscription("sub_1");
      const client = clientFor(
        checkoutSession(sub, { payment_status: paymentStatus }),
      );

      const loaded = await loadStripeSubscriptionsForReconciliation(client, {
        userId: USER_ID,
        customerId: CUSTOMER_ID,
        checkoutSessionId: "cs_1",
      });

      expect(loaded.checkoutSession?.id).toBe("cs_1");
      expect(loaded.subscriptions).toHaveLength(1);
      expect(loaded.selected?.id).toBe("sub_1");
      expect(client.listSubscriptions).not.toHaveBeenCalled();
      expect(client.updateSubscriptionMetadata).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["payment mode", { mode: "payment" }],
    ["open session", { status: "open" }],
    ["expired session", { status: "expired" }],
    ["unpaid session", { payment_status: "unpaid" }],
  ] as const)("rejects a %s", async (_label, override) => {
    const client = clientFor(checkoutSession(subscription("sub_1"), override));
    await expect(
      loadStripeSubscriptionsForReconciliation(client, {
        userId: USER_ID,
        customerId: CUSTOMER_ID,
        checkoutSessionId: "cs_1",
      }),
    ).rejects.toThrow();
  });

  it("rejects Checkout metadata for another user", async () => {
    const client = clientFor(
      checkoutSession(subscription("sub_1"), {
        metadata: { userId: "other-user" },
      }),
    );
    await expect(
      loadStripeSubscriptionsForReconciliation(client, {
        userId: USER_ID,
        customerId: CUSTOMER_ID,
        checkoutSessionId: "cs_1",
      }),
    ).rejects.toThrow("does not belong");
  });

  it("rejects a Checkout Session for another customer", async () => {
    const client = clientFor(
      checkoutSession(subscription("sub_1"), { customer: "cus_other" }),
    );
    await expect(
      loadStripeSubscriptionsForReconciliation(client, {
        userId: USER_ID,
        customerId: CUSTOMER_ID,
        checkoutSessionId: "cs_1",
      }),
    ).rejects.toThrow("customer does not match");
  });

  it("rejects missing, unconfigured, mismatched, and inactive subscriptions", async () => {
    const cases = [
      checkoutSession(null),
      checkoutSession(subscription("sub_bad_price", { priceId: "price_bad" })),
      checkoutSession(subscription("sub_other", { userId: "other-user" })),
      checkoutSession(subscription("sub_canceled", { status: "canceled" })),
    ];

    for (const session of cases) {
      await expect(
        loadStripeSubscriptionsForReconciliation(clientFor(session), {
          userId: USER_ID,
          customerId: CUSTOMER_ID,
          checkoutSessionId: session.id,
        }),
      ).rejects.toThrow();
    }
  });

  it("retrieves a Checkout subscription when Stripe returns only its ID", async () => {
    const client = clientFor(checkoutSession("sub_by_id"));
    const loaded = await loadStripeSubscriptionsForReconciliation(client, {
      userId: USER_ID,
      customerId: CUSTOMER_ID,
      checkoutSessionId: "cs_1",
    });
    expect(client.retrieveSubscription).toHaveBeenCalledWith("sub_by_id");
    expect(loaded.selected?.id).toBe("sub_by_id");
  });

  it("lists portal subscriptions, ignores unknown prices, and persists missing user metadata", async () => {
    const listed = [
      subscription("sub_unknown", { priceId: "price_unknown" }),
      subscription("sub_plus", { metadata: { legacy: "value" } }),
    ];
    const client = {
      retrieveCheckoutSession: vi.fn(),
      retrieveSubscription: vi.fn(),
      listSubscriptions: vi.fn(() => Promise.resolve(listed)),
      updateSubscriptionMetadata: vi.fn(() => Promise.resolve()),
    };
    const loaded = await loadStripeSubscriptionsForReconciliation(client, {
      userId: USER_ID,
      customerId: CUSTOMER_ID,
    });
    expect(client.listSubscriptions).toHaveBeenCalledWith(CUSTOMER_ID);
    expect(loaded.subscriptions.map((sub) => sub.id)).toEqual(["sub_plus"]);
    expect(loaded.subscriptions[0]?.metadata.userId).toBe(USER_ID);
    expect(client.updateSubscriptionMetadata).toHaveBeenCalledWith("sub_plus", {
      legacy: "value",
      userId: USER_ID,
    });
  });

  it("rejects a portal subscription explicitly owned by another user", async () => {
    const client = {
      retrieveCheckoutSession: vi.fn(),
      retrieveSubscription: vi.fn(),
      listSubscriptions: vi.fn(() =>
        Promise.resolve([subscription("sub_other", { userId: "other-user" })]),
      ),
      updateSubscriptionMetadata: vi.fn(() => Promise.resolve()),
    };
    await expect(
      loadStripeSubscriptionsForReconciliation(client, {
        userId: USER_ID,
        customerId: CUSTOMER_ID,
      }),
    ).rejects.toThrow("another user");
  });

  it("selects the highest tier, then the newest subscription", () => {
    const selected = selectBestLiveStripeSubscription([
      subscription("plus_new", { priceId: "price_plus", created: 500 }),
      subscription("pro_old", { priceId: "price_pro", created: 100 }),
      subscription("pro_new", { priceId: "price_pro", created: 300 }),
      subscription("pro_canceled", {
        priceId: "price_pro",
        status: "canceled",
        created: 900,
      }),
    ]);
    expect(selected?.id).toBe("pro_new");
  });

  it("returns no selected subscription when all configured subscriptions are inactive", async () => {
    const client = {
      retrieveCheckoutSession: vi.fn(),
      retrieveSubscription: vi.fn(),
      listSubscriptions: vi.fn(() =>
        Promise.resolve([subscription("sub_canceled", { status: "canceled" })]),
      ),
      updateSubscriptionMetadata: vi.fn(() => Promise.resolve()),
    };
    const loaded = await loadStripeSubscriptionsForReconciliation(client, {
      userId: USER_ID,
      customerId: CUSTOMER_ID,
    });
    expect(loaded.subscriptions).toHaveLength(1);
    expect(loaded.selected).toBeUndefined();
  });
});
