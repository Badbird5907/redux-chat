import type Stripe from "stripe";

import type { PlanTier } from "@redux/shared";

import {
  isPaidSubscriptionStatus,
  resolveTierFromSubscription,
  toSubscriptionSnapshot,
} from "./billing";
import { isConfiguredStripePlanPrice } from "./stripe";

export type StripeSubscriptionReconciliationClient = {
  retrieveCheckoutSession: (
    checkoutSessionId: string,
  ) => Promise<Stripe.Checkout.Session>;
  retrieveSubscription: (
    subscriptionId: string,
  ) => Promise<Stripe.Subscription>;
  listSubscriptions: (customerId: string) => Promise<Stripe.Subscription[]>;
  updateSubscriptionMetadata: (
    subscriptionId: string,
    metadata: Stripe.MetadataParam,
  ) => Promise<void>;
};

export type LoadedStripeSubscriptionReconciliation = {
  checkoutSession?: Stripe.Checkout.Session;
  subscriptions: Stripe.Subscription[];
  selected?: Stripe.Subscription;
};

function planTierRank(tier: PlanTier): number {
  if (tier === "free") return 0;
  if (tier === "plus") return 1;
  return 2;
}

export async function loadStripeSubscriptionsForReconciliation(
  client: StripeSubscriptionReconciliationClient,
  args: {
    userId: string;
    customerId: string;
    checkoutSessionId?: string;
  },
): Promise<LoadedStripeSubscriptionReconciliation> {
  let checkoutSession: Stripe.Checkout.Session | undefined;
  let subscriptions: Stripe.Subscription[];

  if (args.checkoutSessionId) {
    checkoutSession = await client.retrieveCheckoutSession(
      args.checkoutSessionId,
    );
    validateSubscriptionCheckoutSession(checkoutSession, args);
    const subscriptionValue = checkoutSession.subscription;
    if (!subscriptionValue) {
      throw new Error("Stripe Checkout did not create a subscription.");
    }
    const subscription =
      typeof subscriptionValue === "string"
        ? await client.retrieveSubscription(subscriptionValue)
        : subscriptionValue;
    validateStripeSubscriptionForUser(subscription, args.userId, true);
    subscriptions = [subscription];
  } else {
    const listed = await client.listSubscriptions(args.customerId);
    subscriptions = listed.filter((subscription) =>
      validateStripeSubscriptionForUser(subscription, args.userId, false),
    );
  }

  const normalized = await Promise.all(
    subscriptions.map(async (subscription) => {
      if (subscription.metadata.userId) return subscription;
      const metadata = { ...subscription.metadata, userId: args.userId };
      await client.updateSubscriptionMetadata(subscription.id, metadata);
      return { ...subscription, metadata };
    }),
  );
  return {
    checkoutSession,
    subscriptions: normalized,
    selected: selectBestLiveStripeSubscription(normalized),
  };
}

export function validateSubscriptionCheckoutSession(
  session: Stripe.Checkout.Session,
  expected: { userId: string; customerId: string },
): void {
  if (session.mode !== "subscription") {
    throw new Error("Stripe Checkout Session is not a subscription checkout.");
  }
  if (session.status !== "complete") {
    throw new Error("Stripe Checkout Session is not complete.");
  }
  if (
    session.payment_status !== "paid" &&
    session.payment_status !== "no_payment_required"
  ) {
    throw new Error("Stripe Checkout Session payment is not complete.");
  }
  if (session.metadata?.userId !== expected.userId) {
    throw new Error("Stripe Checkout Session does not belong to this user.");
  }
  if (stripeExpandableId(session.customer) !== expected.customerId) {
    throw new Error("Stripe Checkout Session customer does not match.");
  }
}

export function validateStripeSubscriptionForUser(
  subscription: Stripe.Subscription,
  userId: string,
  requirePaid: boolean,
): boolean {
  const metadataUserId = subscription.metadata.userId;
  if (requirePaid) {
    if (metadataUserId !== userId) {
      throw new Error("Stripe subscription does not belong to this user.");
    }
  } else if (metadataUserId && metadataUserId !== userId) {
    throw new Error("Stripe subscription belongs to another user.");
  }

  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId || !isConfiguredStripePlanPrice(priceId)) {
    if (requirePaid) {
      throw new Error("Stripe subscription does not use a configured plan.");
    }
    return false;
  }

  if (requirePaid && !isPaidSubscriptionStatus(subscription.status)) {
    throw new Error("Stripe subscription is not active or trialing.");
  }
  return true;
}

export function selectBestLiveStripeSubscription(
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription | undefined {
  return subscriptions.reduce<Stripe.Subscription | undefined>(
    (best, subscription) => {
      if (!isPaidSubscriptionStatus(subscription.status)) return best;
      const tier = resolveTierFromSubscription(
        toSubscriptionSnapshot(subscription),
      );
      if (tier === "free") return best;
      if (!best) return subscription;

      const bestTier = resolveTierFromSubscription(
        toSubscriptionSnapshot(best),
      );
      const rankDifference = planTierRank(tier) - planTierRank(bestTier);
      if (rankDifference > 0) return subscription;
      if (rankDifference < 0) return best;
      return subscription.created > best.created ? subscription : best;
    },
    undefined,
  );
}

function stripeExpandableId(
  value: string | { id: string } | null | undefined,
): string | undefined {
  return typeof value === "string" ? value : value?.id;
}
