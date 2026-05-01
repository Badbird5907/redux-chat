import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";

import { useQuery } from "@/lib/hooks/convex";

export const Route = createFileRoute("/settings/")({
  component: RouteComponent,
});

function RouteComponent() {
  const billingState = useQuery(
    api.functions.billing.getCurrentBillingState,
    {},
  );
  const grantMonthlyCredits = useAction(
    api.functions.billing.grantMonthlyCreditsForCurrentUserIfNeeded,
  );
  const refreshMeterState = useAction(
    api.functions.billing.refreshCurrentUserMeterState,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncDebug, setSyncDebug] = useState<string | null>(null);
  const didRequestInitialSync = useRef(false);
  const availableCredits =
    typeof billingState?.availableCredits === "number"
      ? billingState.availableCredits
      : undefined;
  const overageCredits =
    typeof billingState?.overageCredits === "number"
      ? billingState.overageCredits
      : 0;
  const includedMonthlyCredits =
    typeof billingState?.includedMonthlyCredits === "number"
      ? billingState.includedMonthlyCredits
      : undefined;
  const creditsUsed =
    availableCredits !== undefined && includedMonthlyCredits !== undefined
      ? Math.max(0, includedMonthlyCredits - availableCredits + overageCredits)
      : undefined;

  useEffect(() => {
    if (!billingState || didRequestInitialSync.current) {
      return;
    }

    if (billingState.availableCredits !== undefined) {
      return;
    }

    didRequestInitialSync.current = true;
    void grantMonthlyCredits({})
      .then((result) => {
        if (result.availableCredits === undefined) {
          setSyncError("Credit sync failed. Check backend logs for Polar meter details.");
          setSyncDebug(
            `tier=${result.tier} period=${result.periodKey} grantApplied=${String(result.grantApplied)}`,
          );
          return;
        }

        setSyncError(null);
        setSyncDebug(
          `tier=${result.tier} credits=${result.availableCredits} period=${result.periodKey} grantApplied=${String(result.grantApplied)}`,
        );
      })
      .catch((error: unknown) => {
        setSyncError(
          error instanceof Error ? error.message : "Failed to sync credits",
        );
        setSyncDebug(null);
        didRequestInitialSync.current = false;
      });
  }, [billingState, grantMonthlyCredits]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSyncError(null);

    try {
      const result = await refreshMeterState({});
      if (result.availableCredits === undefined) {
        setSyncError("Credit sync failed. Check backend logs for Polar meter details.");
        setSyncDebug(
          `tier=${result.tier} period=${result.periodKey} grantApplied=${String(result.grantApplied)}`,
        );
        return;
      }

      setSyncDebug(
        `tier=${result.tier} credits=${result.availableCredits} period=${result.periodKey} grantApplied=${String(result.grantApplied)}`,
      );
    } catch (error) {
      setSyncError(
        error instanceof Error ? error.message : "Failed to refresh credits",
      );
      setSyncDebug(null);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col">
      <h1 className="text-2xl font-semibold tracking-tight">
        General Settings
      </h1>
      <section className="mt-8 rounded-2xl border border-neutral-200 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/70">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold">Billing</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh Credits"}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <BillingStat
            label="Tier"
            value={
              billingState?.tier ? toTitleCase(billingState.tier) : "Loading"
            }
          />
          <BillingStat
            label="Available Credits"
            value={
              availableCredits !== undefined
                ? formatNumber(availableCredits)
                : "Syncing"
            }
          />
          <BillingStat
            label="Monthly Credits"
            value={
              includedMonthlyCredits !== undefined
                ? formatNumber(includedMonthlyCredits)
                : "Loading"
            }
          />
          <BillingStat
            label="Used This Month"
            value={
              creditsUsed !== undefined ? formatNumber(creditsUsed) : "Syncing"
            }
          />
        </div>

        <div className="text-muted-foreground mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span>
            Overage:{" "}
            <span className="text-foreground">
              {billingState?.overageAllowed ? "Enabled" : "Disabled"}
            </span>
          </span>
          <span>
            Meter:{" "}
            <span className="text-foreground">
              {billingState?.meterName ?? "Credits"}
            </span>
          </span>
          <span>
            Period ends:{" "}
            <span className="text-foreground">
              {formatDate(billingState?.currentPeriodEnd)}
            </span>
          </span>
          <span>
            Last synced:{" "}
            <span className="text-foreground">
              {formatDate(billingState?.syncedAt)}
            </span>
          </span>
        </div>

        {syncError ? (
          <div className="mt-4 space-y-1">
            <p className="text-sm text-red-600 dark:text-red-400">{syncError}</p>
            {syncDebug ? (
              <p className="text-muted-foreground text-xs">{syncDebug}</p>
            ) : null}
          </div>
        ) : syncDebug ? (
          <p className="text-muted-foreground mt-4 text-xs">{syncDebug}</p>
        ) : null}
      </section>
    </div>
  );
}

function BillingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-900/80">
      <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: number | undefined) {
  if (typeof value !== "number") {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function toTitleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}
