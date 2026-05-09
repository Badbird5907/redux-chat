import { createServerFn } from "@tanstack/react-start";

import { api } from "@redux/backend/convex/_generated/api";

import { fetchAuthAction, fetchAuthQuery } from "@/lib/auth/server";

export const getCurrentBillingState = createServerFn({ method: "GET" }).handler(
  async () => {
    const baseState = await fetchAuthQuery(
      api.functions.billing.getCurrentBillingState,
      {},
    );
    const refreshed = await fetchAuthAction(
      api.functions.billing.refreshCurrentUserBillingState,
      {},
    );

    return {
      ...baseState,
      tier: refreshed.tier,
      availableCredits: refreshed.availableCredits,
      overageCredits: refreshed.overageCredits,
      spendableCredits: refreshed.spendableCredits,
      bucketBalances: refreshed.bucketBalances,
      expiringSoon: refreshed.expiringSoon,
      overageAllowed: refreshed.overageAllowed,
      syncedAt: Date.now(),
    };
  },
);
