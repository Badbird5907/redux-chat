import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";
import type { ComponentProps, ReactNode } from "react";
import type { PlanTier } from "@redux/shared";
import { DEFAULT_BILLING_CONFIG, getPlanConfig } from "@redux/shared";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { ChevronRight, RefreshCw } from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import { Button, buttonVariants } from "@redux/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@redux/ui/components/progress";
import { cn } from "@redux/ui/lib/utils";

import { useQuery } from "@/lib/hooks/convex";

export const Route = createFileRoute("/settings/")({
  component: RouteComponent,
});

const billingConfig = DEFAULT_BILLING_CONFIG;

function tierRank(tier: PlanTier): number {
  if (tier === "free") {
    return 0;
  }
  if (tier === "plus") {
    return 1;
  }
  return 2;
}

function formatPolarRecurringPrice(
  product:
    | { prices?: readonly { priceAmount?: number | null; priceCurrency?: string | null }[] }
    | null
    | undefined,
): string | undefined {
  if (!product?.prices?.[0]) {
    return undefined;
  }
  const { priceAmount, priceCurrency } = product.prices[0];
  if (typeof priceAmount !== "number" || priceAmount < 0) {
    return undefined;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (priceCurrency ?? "USD").toUpperCase(),
    }).format(priceAmount / 100);
  } catch {
    return `$${String(priceAmount / 100)}`;
  }
}

function renewalSummary(periodEnd: number | undefined): string | null {
  if (typeof periodEnd !== "number") {
    return null;
  }
  const days = Math.max(0, Math.ceil((periodEnd - Date.now()) / 86_400_000));
  const dateStr = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    periodEnd,
  );
  return `${dateStr} (${days}d)`;
}

type PolarCheckoutApi = { generateCheckoutLink: typeof api.polar.generateCheckoutLink };

function RouteComponent() {
  const polarProducts = useQuery(api.polar.getConfiguredProducts, {});
  const baseBillingState = useQuery(api.functions.billing.getCurrentBillingState, {});
  const refreshMeterState = useAction(api.functions.billing.refreshCurrentUserMeterState);
  const switchPaidPlan = useAction(api.functions.billing.switchCurrentUserPaidPlan);
  const [liveMeterState, setLiveMeterState] = useState<
    | {
        tier: PlanTier;
        availableCredits: number | undefined;
        overageCredits: number | undefined;
        overageAllowed: boolean;
        syncedAt: number;
      }
    | undefined
  >(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [planSwitchConfirm, setPlanSwitchConfirm] = useState<{
    productId: string;
    planName: string;
    isUpgrade: boolean;
  } | null>(null);
  const [planSwitchLoading, setPlanSwitchLoading] = useState(false);

  const billingState = useMemo(() => {
    if (!baseBillingState) {
      return undefined;
    }
    if (!liveMeterState) {
      return baseBillingState;
    }
    return {
      ...baseBillingState,
      tier: liveMeterState.tier,
      availableCredits: liveMeterState.availableCredits,
      overageCredits: liveMeterState.overageCredits,
      overageAllowed: liveMeterState.overageAllowed,
      syncedAt: liveMeterState.syncedAt,
    };
  }, [baseBillingState, liveMeterState]);

  const availableCredits =
    typeof billingState?.availableCredits === "number"
      ? billingState.availableCredits
      : undefined;
  const overageCredits =
    typeof billingState?.overageCredits === "number" ? billingState.overageCredits : 0;
  const includedMonthlyCredits =
    typeof billingState?.includedMonthlyCredits === "number"
      ? billingState.includedMonthlyCredits
      : undefined;
  const creditsUsed =
    availableCredits !== undefined && includedMonthlyCredits !== undefined
      ? Math.max(0, includedMonthlyCredits - availableCredits + overageCredits)
      : undefined;

  const creditProgressPct =
    includedMonthlyCredits !== undefined &&
    includedMonthlyCredits > 0 &&
    creditsUsed !== undefined
      ? Math.min(100, Math.round((creditsUsed / includedMonthlyCredits) * 100))
      : undefined;

  useEffect(() => {
    void refreshMeterState({})
      .then((state) => {
        setLiveMeterState({
          tier: state.tier,
          availableCredits: state.availableCredits,
          overageCredits: state.overageCredits,
          overageAllowed: state.overageAllowed,
          syncedAt: Date.now(),
        });
      })
      .catch((error) => {
        setSyncError(
          error instanceof Error ? error.message : "Failed to load billing state",
        );
      });
  }, [refreshMeterState]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSyncError(null);
    try {
      const result = await refreshMeterState({});
      const syncedAt = Date.now();
      setLiveMeterState({
        tier: result.tier,
        availableCredits: result.availableCredits,
        overageCredits: result.overageCredits,
        overageAllowed: result.overageAllowed,
        syncedAt,
      });
      if (result.availableCredits === undefined) {
        setSyncError("Credits could not be synced.");
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Failed to refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  const currentTier = billingState?.tier ?? "free";
  const plusProduct = polarProducts?.plus ?? null;
  const proProduct = polarProducts?.pro ?? null;
  const polarApi = useMemo<PolarCheckoutApi>(
    () => ({ generateCheckoutLink: api.polar.generateCheckoutLink }),
    [],
  );
  const portalApi = useMemo(
    () => ({ generateCustomerPortalUrl: api.polar.generateCustomerPortalUrl }),
    [],
  );

  const subscriptionId = billingState?.subscription?.subscriptionId;
  const showPaidManage = tierRank(currentTier) >= 1;
  const isOnPaidPlan = showPaidManage;

  const renewSummary = renewalSummary(billingState?.currentPeriodEnd);

  const checkoutAnchorClass =
    "inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-events-auto";

  const rank = tierRank(currentTier);

  const confirmPlanSwitch = async () => {
    if (!planSwitchConfirm) {
      return;
    }
    setPlanSwitchLoading(true);
    setSyncError(null);
    try {
      await switchPaidPlan({ productId: planSwitchConfirm.productId });
      setPlanSwitchConfirm(null);
      const result = await refreshMeterState({});
      setLiveMeterState({
        tier: result.tier,
        availableCredits: result.availableCredits,
        overageCredits: result.overageCredits,
        overageAllowed: result.overageAllowed,
        syncedAt: Date.now(),
      });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Plan switch failed");
    } finally {
      setPlanSwitchLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 px-2.5 text-xs"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
          >
            <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            Sync
          </Button>
          {showPaidManage ? (
            <CustomerPortalLink
              polarApi={portalApi}
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "h-8 gap-1 px-2.5 text-xs",
              )}
            >
              Manage billing
              <ChevronRight className="size-3.5 opacity-60" aria-hidden />
            </CustomerPortalLink>
          ) : null}
        </div>
      </div>

      <Dialog
        open={planSwitchConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !planSwitchLoading) {
            setPlanSwitchConfirm(null);
          }
        }}
      >
        <DialogContent showCloseButton={!planSwitchLoading}>
          <DialogHeader>
            <DialogTitle>Switch to {planSwitchConfirm?.planName}?</DialogTitle>
            <DialogDescription>
              {planSwitchConfirm?.isUpgrade ? (
                <>
                  Your subscription updates now and Polar bills the prorated upgrade
                  immediately on a separate invoice (not deferred to the next renewal).
                </>
              ) : (
                <>
                  The lower plan is scheduled for the start of your next billing period.
                  You keep your current benefits until then; there is no mid-cycle credit or
                  downgrade charge.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlanSwitchConfirm(null)}
              disabled={planSwitchLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void confirmPlanSwitch()}
              disabled={planSwitchLoading}
            >
              {planSwitchLoading ? "Switching…" : "Confirm switch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section className="space-y-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Included credits
        </p>
        <Panel className="py-5">
          {creditProgressPct !== undefined ? (
            <Progress
              value={creditProgressPct}
              aria-label="Included credits used this period"
              className="flex-col gap-3 [&_[data-slot=progress-track]]:h-2"
            >
              <div className="flex w-full items-baseline justify-between gap-3">
                <ProgressLabel className="text-muted-foreground text-xs font-normal">
                  Used
                </ProgressLabel>
                <ProgressValue className="text-foreground shrink-0 text-sm font-medium tabular-nums" />
              </div>
            </Progress>
          ) : (
            <p className="text-muted-foreground text-sm">Sync to load usage.</p>
          )}
          {creditsUsed !== undefined &&
          includedMonthlyCredits !== undefined &&
          availableCredits !== undefined ? (
            <p className="text-muted-foreground mt-4 text-xs tabular-nums">
              {formatNumber(creditsUsed)} used · {formatNumber(availableCredits)} left ·{" "}
              {formatNumber(includedMonthlyCredits)} included
            </p>
          ) : (
            <p className="text-muted-foreground mt-4 text-xs">Figures update after a successful sync.</p>
          )}
        </Panel>
      </section>

      <section className="space-y-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Plans
        </p>
        <p className="text-muted-foreground text-xs leading-relaxed">
          New subscriptions use checkout. If you already pay for Plus or Pro, you can switch
          plans here (upgrades bill now; downgrades apply at renewal). Use Manage billing for
          payment method, invoices, and cancellation.
        </p>
        <div className="grid gap-4 lg:grid-cols-3">
          <TierColumn
            name="Free"
            plan={getPlanConfig("free", billingConfig)}
            priceLabel={formatPolarRecurringPrice(polarProducts?.free ?? undefined)}
            state={rank === 0 ? "current" : "inactive"}
            polarApi={polarApi}
            checkoutAnchorClass={checkoutAnchorClass}
            renewalSummary={renewSummary}
          />
          <TierColumn
            name="Plus"
            plan={getPlanConfig("plus", billingConfig)}
            priceLabel={formatPolarRecurringPrice(plusProduct ?? undefined)}
            state={rank === 1 ? "current" : rank === 0 ? "available" : "available"}
            polarApi={polarApi}
            checkoutAnchorClass={checkoutAnchorClass}
            productId={plusProduct?.id}
            subscriptionId={subscriptionId ?? undefined}
            buttonLabel="Plus"
            emphasize={rank === 0}
            renewalSummary={renewSummary}
            paidSwitch={
              isOnPaidPlan && rank === 2 && plusProduct?.id
                ? {
                    isUpgrade: false,
                    onRequest: () =>
                      setPlanSwitchConfirm({
                        productId: plusProduct.id,
                        planName: "Plus",
                        isUpgrade: false,
                      }),
                  }
                : undefined
            }
          />
          <TierColumn
            name="Pro"
            plan={getPlanConfig("pro", billingConfig)}
            priceLabel={formatPolarRecurringPrice(proProduct ?? undefined)}
            state={rank === 2 ? "current" : rank < 2 ? "available" : "inactive"}
            polarApi={polarApi}
            checkoutAnchorClass={checkoutAnchorClass}
            productId={proProduct?.id}
            subscriptionId={subscriptionId ?? undefined}
            buttonLabel="Pro"
            emphasize={rank === 1}
            renewalSummary={renewSummary}
            paidSwitch={
              isOnPaidPlan && rank === 1 && proProduct?.id
                ? {
                    isUpgrade: true,
                    onRequest: () =>
                      setPlanSwitchConfirm({
                        productId: proProduct.id,
                        planName: "Pro",
                        isUpgrade: true,
                      }),
                  }
                : undefined
            }
          />
        </div>
      </section>

      {syncError ? (
        <p className="text-destructive text-sm" role="alert">
          {syncError}
        </p>
      ) : null}
    </div>
  );
}

function Panel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-border bg-muted/35 rounded-xl border px-5 py-4 shadow-none",
        className,
      )}
      {...props}
    />
  );
}

function TierColumn({
  name,
  plan,
  priceLabel,
  state,
  polarApi,
  checkoutAnchorClass,
  productId,
  subscriptionId,
  emphasize,
  buttonLabel,
  renewalSummary: renewalLine,
  paidSwitch,
}: {
  name: string;
  plan: ReturnType<typeof getPlanConfig>;
  priceLabel?: string;
  state: "current" | "available" | "inactive";
  polarApi: PolarCheckoutApi;
  checkoutAnchorClass: string;
  productId?: string;
  subscriptionId?: string;
  emphasize?: boolean;
  buttonLabel?: string;
  renewalSummary?: string | null;
  paidSwitch?: { isUpgrade: boolean; onRequest: () => void };
}) {
  const priced =
    priceLabel !== undefined
      ? `${priceLabel}/mo`
      : name === "Free"
        ? "$0/mo"
        : "—";

  const footer: ReactNode =
    state === "current" ? (
      <Button disabled variant="outline" size="sm" className="mt-auto w-full text-xs">
        Current plan
      </Button>
    ) : state === "inactive" ? (
      <div className="mt-auto pt-6" aria-hidden />
    ) : productId !== undefined && paidSwitch ? (
      <Button
        type="button"
        variant={emphasize ? "default" : "outline"}
        size="sm"
        className={cn("mt-auto w-full text-xs", !emphasize && "bg-transparent")}
        onClick={paidSwitch.onRequest}
      >
        {paidSwitch.isUpgrade
          ? `Upgrade to ${buttonLabel ?? name}`
          : `Downgrade to ${buttonLabel ?? name} (next renewal)`}
      </Button>
    ) : productId !== undefined ? (
      <CheckoutLink
        polarApi={polarApi}
        productIds={[productId]}
        subscriptionId={subscriptionId}
        lazy
        embed={false}
        className={cn(
          checkoutAnchorClass,
          emphasize
            ? buttonVariants({ variant: "default", size: "sm" })
            : buttonVariants({ variant: "outline", size: "sm", className: "bg-transparent" }),
          "mt-auto",
        )}
      >
        Subscribe to {buttonLabel ?? name}
      </CheckoutLink>
    ) : (
      <Button disabled variant="outline" size="sm" className="mt-auto w-full text-xs">
        Unavailable
      </Button>
    );

  return (
    <Panel
      className={cn(
        "flex min-h-[192px] flex-col py-5",
        emphasize && state === "available"
          ? "border-primary/40 bg-primary/[0.03] ring-primary/12 ring-1"
          : null,
      )}
    >
      <p className="text-base font-semibold">{name}</p>
      <p className="text-foreground mt-1 font-mono text-lg font-semibold tabular-nums">
        {priced}
      </p>
      {state === "current" ? (
        renewalLine != null ? (
          <p className="text-muted-foreground mt-2 text-xs">Renews {renewalLine}</p>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">Renewal loads after meter sync.</p>
        )
      ) : null}
      <ul className="text-muted-foreground mt-3 flex-1 space-y-1.5 text-xs leading-relaxed">
        <li>{formatNumber(plan.includedMonthlyCredits)} credits / period</li>
        <li>{plan.markupMultiplier}× markup vs raw usage</li>
        <li>Overdraft {plan.overageAllowed ? "on" : "off"}</li>
      </ul>
      {footer}
    </Panel>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}
