import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import { getCurrentBillingState } from "@/server/billing/get-current-billing-state";

export function useBillingState() {
  const fetchBillingState = useServerFn(getCurrentBillingState);
  const [billingState, setBillingState] = useState<
    Awaited<ReturnType<typeof fetchBillingState>> | undefined
  >(undefined);

  useEffect(() => {
    let cancelled = false;
    const sync = () => {
      void fetchBillingState()
        .then((state) => {
          if (!cancelled) {
            setBillingState(state);
          }
        })
        .catch((error) => {
          console.error("Failed to fetch billing state", error);
        });
    };
    sync();
    const interval = window.setInterval(sync, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [fetchBillingState]);

  // Prefer the ledger-aware aggregate `spendableCredits` when available.
  // The legacy Polar-meter shape exposed `availableCredits`; we keep that
  // as a fallback so a stale cache doesn't accidentally lock users out.
  const spendable =
    billingState?.spendableCredits ?? billingState?.availableCredits;
  const isOutOfCredits =
    spendable !== undefined && spendable <= 0 && !billingState?.overageAllowed;

  return useMemo(
    () => ({
      billingState,
      isOutOfCredits,
    }),
    [billingState, isOutOfCredits],
  );
}
