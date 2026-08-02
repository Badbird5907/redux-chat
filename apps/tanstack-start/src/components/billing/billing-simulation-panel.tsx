import { useAction } from "convex/react";
import { TriangleAlert } from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";

import { useQuery } from "@/lib/hooks/convex";
import { useReducerState } from "@/lib/hooks/use-reducer-state";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

type SimulationTier = "plus" | "pro";

export function BillingSimulationPanel({
  hasRealPaidSubscription,
}: {
  hasRealPaidSubscription: boolean;
}) {
  const simulation = useQuery(
    api.functions.billingSimulation.getCurrentUserBillingSimulation,
    {},
  );
  const setSimulation = useAction(
    api.functions.billingSimulation.setCurrentUserBillingSimulation,
  );
  const clearSimulation = useAction(
    api.functions.billingSimulation.clearCurrentUserBillingSimulation,
  );
  const [pendingTier, setPendingTier] = useReducerState<SimulationTier | null>(
    null,
  );
  const [resetting, setResetting] = useReducerState(false);
  const [error, setError] = useReducerState<string | null>(null);

  if (!simulation?.available) return null;

  const setTier = async (tier: SimulationTier) => {
    setPendingTier(tier);
    setError(null);
    try {
      await setSimulation({ tier });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not enable preview billing simulation.",
      );
    } finally {
      setPendingTier(null);
    }
  };

  const reset = async () => {
    setResetting(true);
    setError(null);
    try {
      await clearSimulation({});
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reset preview billing simulation.",
      );
    } finally {
      setResetting(false);
    }
  };

  const busy = pendingTier !== null || resetting;
  const activeTierLabel = simulation.tier === "pro" ? "Pro" : "Plus";

  return (
    <Card
      className={
        simulation.active
          ? "gap-4 border-amber-500/35 bg-amber-500/8 px-5 py-4 ring-1 ring-amber-500/15"
          : "bg-card/55 gap-4 px-5 py-4"
      }
    >
      <div className="space-y-1.5">
        <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {simulation.active ? (
            <TriangleAlert className="size-4 text-amber-600" aria-hidden />
          ) : null}
          {simulation.active
            ? "Preview billing simulation active"
            : "Preview billing simulator"}
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {simulation.active ? (
            <>
              This account is simulating the {activeTierLabel} plan only in this
              preview or local Convex deployment. No Stripe subscription was
              created.
            </>
          ) : (
            <>
              Test paid-plan entitlements and monthly credits for this account
              without opening Stripe Checkout. This changes only the current
              preview or local Convex deployment.
            </>
          )}
        </p>
        {simulation.active && simulation.periodEnd ? (
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Simulated {activeTierLabel} access expires{" "}
            {dateFormatter.format(simulation.periodEnd)}.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        {(["plus", "pro"] as const).map((tier) => {
          const label = tier === "plus" ? "Plus" : "Pro";
          const current = simulation.active && simulation.tier === tier;
          return (
            <Button
              key={tier}
              type="button"
              variant={current ? "default" : "outline"}
              disabled={busy || hasRealPaidSubscription || current}
              onClick={() => void setTier(tier)}
            >
              {pendingTier === tier
                ? "Simulating " + label + "…"
                : current
                  ? label + " simulated"
                  : "Simulate " + label}
            </Button>
          );
        })}
        {simulation.active ? (
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void reset()}
          >
            {resetting ? "Resetting…" : "Reset simulation"}
          </Button>
        ) : null}
      </div>

      {!simulation.active && hasRealPaidSubscription ? (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Simulation is unavailable because this account has a real active
          Stripe subscription. Use a fresh preview account to test simulated
          plans.
        </p>
      ) : null}

      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
