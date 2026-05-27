import { StripeSubscriptions } from "@convex-dev/stripe";
import Stripe from "stripe";

import type { PlanTier } from "@redux/shared";

import { components } from "./_generated/api";
import { backendEnv } from "./env";

export const stripeComponent = new StripeSubscriptions(components.stripe);

export function getStripeSdkClient() {
  const env = backendEnv();
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set.");
  }
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export function getStripePlanPrices() {
  const env = backendEnv();
  if (!env.STRIPE_PLUS_PRICE_ID) {
    throw new Error("STRIPE_PLUS_PRICE_ID is not set.");
  }
  if (!env.STRIPE_PRO_PRICE_ID) {
    throw new Error("STRIPE_PRO_PRICE_ID is not set.");
  }
  return {
    plus: env.STRIPE_PLUS_PRICE_ID,
    pro: env.STRIPE_PRO_PRICE_ID,
  } as const;
}

export function priceIdForTier(tier: PlanTier): string | undefined {
  const prices = getStripePlanPrices();
  if (tier === "plus") return prices.plus;
  if (tier === "pro") return prices.pro;
  return undefined;
}

export function tierFromStripePriceId(priceId: string): PlanTier {
  const prices = getStripePlanPrices();
  if (priceId === prices.plus) return "plus";
  if (priceId === prices.pro) return "pro";
  throw new Error("That price is not a configured plan.");
}

export function isConfiguredStripePlanPrice(priceId: string): boolean {
  const prices = getStripePlanPrices();
  return priceId === prices.plus || priceId === prices.pro;
}
