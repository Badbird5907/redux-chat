import type { GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { DataModel } from "./_generated/dataModel";
import {
  isPaidSubscriptionStatus,
  resolveTierFromSubscription,
  toSubscriptionSnapshot,
} from "./billing";
import { backendEnv } from "./env";

export type BillingSimulationTier = "plus" | "pro";

export const billingSimulationTierValidator = v.union(
  v.literal("plus"),
  v.literal("pro"),
);

export function isBillingSimulationAvailable(): boolean {
  const env = backendEnv();
  return isBillingSimulationAvailableFor(
    env.BILLING_SIMULATION_ENABLED,
    env.SITE_URL,
  );
}

export function isBillingSimulationAvailableFor(
  enabled: boolean | undefined,
  siteUrl: string,
): boolean {
  if (enabled !== true) return false;

  let url: URL;
  try {
    url = new URL(siteUrl);
  } catch {
    return false;
  }

  const localHost =
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "::1" ||
      url.hostname === "[::1]");
  const vercelPreview =
    url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
  return localHost || vercelPreview;
}

export function hasActiveRealStripeSubscription(
  subscriptions: unknown[],
): boolean {
  return subscriptions.some((candidate) => {
    const subscription = toSubscriptionSnapshot(candidate);
    return (
      isPaidSubscriptionStatus(subscription?.status) &&
      resolveTierFromSubscription(subscription) !== "free"
    );
  });
}

export function assertBillingSimulationAvailable(): void {
  if (!isBillingSimulationAvailable()) {
    throw new ConvexError(
      "Billing simulation is not available in this deployment.",
    );
  }
}

export async function getBillingSimulationOverride(
  ctx: Pick<GenericQueryCtx<DataModel>, "db">,
  userId: string,
) {
  return await ctx.db
    .query("billingSimulationOverrides")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function getActiveBillingSimulation(
  ctx: Pick<GenericQueryCtx<DataModel>, "db">,
  userId: string,
  now = Date.now(),
) {
  if (!isBillingSimulationAvailable()) return null;
  const override = await getBillingSimulationOverride(ctx, userId);
  return override && override.periodEnd > now ? override : null;
}

export function billingSimulationSourceId(
  userId: string,
  periodKey: string,
): string {
  return `billing-simulation:${userId}:${periodKey}`;
}
