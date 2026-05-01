import { api } from "@redux/backend/convex/_generated/api";

import { useQuery } from "@/lib/hooks/convex";

export function useBillingState() {
  const billingState = useQuery(api.functions.billing.getCurrentBillingState, {});
  const isOutOfCredits =
    billingState?.availableCredits !== undefined &&
    billingState.availableCredits <= 0 &&
    !billingState.overageAllowed;

  return {
    billingState,
    isOutOfCredits,
  };
}
