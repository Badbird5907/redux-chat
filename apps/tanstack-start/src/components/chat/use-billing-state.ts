import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { getCurrentBillingState } from "@/server/billing/get-current-billing-state";

export function useBillingState() {
  const fetchBillingState = useServerFn(getCurrentBillingState);
  const [billingState, setBillingState] = useState<
    Awaited<ReturnType<typeof fetchBillingState>> | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    const sync = () =>
      fetchBillingState()
        .then((state) => {
          if (!cancelled) {
            setBillingState(state);
          }
        })
        .catch((error) => {
          console.error("Failed to fetch billing state", error);
        });
    void sync();
    const interval = window.setInterval(sync, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchBillingState]);

  const isOutOfCredits =
    billingState?.availableCredits !== undefined &&
    billingState.availableCredits <= 0 &&
    !billingState.overageAllowed;

  return useMemo(
    () => ({
      billingState,
      isOutOfCredits,
    }),
    [billingState, isOutOfCredits],
  );
}
