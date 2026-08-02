import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  hasActiveRealStripeSubscription,
  isBillingSimulationAvailableFor,
} from "./billingSimulation";

describe("billing simulation security gate", () => {
  it("requires an explicit enabled flag", () => {
    expect(
      isBillingSimulationAvailableFor(
        false,
        "https://redux-chat-git-feature.vercel.app",
      ),
    ).toBe(false);
    expect(
      isBillingSimulationAvailableFor(
        undefined,
        "https://redux-chat-git-feature.vercel.app",
      ),
    ).toBe(false);
  });

  it.each([
    "http://localhost:3712",
    "http://127.0.0.1:3712",
    "http://[::1]:3712",
    "https://redux-chat-git-feature.vercel.app",
  ])("accepts eligible origin %s", (siteUrl) => {
    expect(isBillingSimulationAvailableFor(true, siteUrl)).toBe(true);
  });

  it.each([
    "https://redux.chat",
    "https://www.redux.chat",
    "https://example.com",
    "https://localhost.attacker.test",
    "http://preview.vercel.app",
    "https://vercel.app",
    "not a URL",
  ])("rejects production, custom, or spoofed origin %s", (siteUrl) => {
    expect(isBillingSimulationAvailableFor(true, siteUrl)).toBe(false);
  });
});

describe("real subscription detection for simulation", () => {
  beforeEach(() => {
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("STRIPE_PLUS_PRICE_ID", "price_plus");
    vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("blocks active and trialing configured subscriptions", () => {
    expect(
      hasActiveRealStripeSubscription([
        {
          status: "active",
          priceId: "price_plus",
          stripeSubscriptionId: "sub_plus",
        },
      ]),
    ).toBe(true);
    expect(
      hasActiveRealStripeSubscription([
        {
          status: "trialing",
          priceId: "price_pro",
          stripeSubscriptionId: "sub_pro",
        },
      ]),
    ).toBe(true);
  });

  it("ignores canceled and unconfigured subscriptions", () => {
    expect(
      hasActiveRealStripeSubscription([
        { status: "canceled", priceId: "price_plus" },
        { status: "active", priceId: "price_unknown" },
      ]),
    ).toBe(false);
  });
});
