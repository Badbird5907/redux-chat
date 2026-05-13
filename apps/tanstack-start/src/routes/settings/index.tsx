import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { ChevronRight, CreditCard } from "lucide-react";

import type { PlanTier } from "@redux/shared";
import { api } from "@redux/backend/convex/_generated/api";
import { DEFAULT_BILLING_CONFIG, getPlanConfig } from "@redux/shared";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { cn } from "@redux/ui/lib/utils";

import { AddCreditsDialog } from "@/components/billing/add-credits-dialog";
import {
  CreditBalancePanel,
  formatNumber,
} from "@/components/billing/credit-balance-panel";
import { CreditGrantHistoryDialog } from "@/components/billing/credit-grant-history";
import { useQuery } from "@/lib/hooks/convex";

export const Route = createFileRoute("/settings/")({
  component: RouteComponent,
});

const billingConfig = DEFAULT_BILLING_CONFIG;

type StripePlanPrice = {
  id: string;
  amount?: number | null;
  currency?: string | null;
} | null;

type StripePriceConfig = {
  plus: NonNullable<StripePlanPrice>;
  pro: NonNullable<StripePlanPrice>;
};

function tierRank(tier: PlanTier): number {
  if (tier === "free") {
    return 0;
  }
  if (tier === "plus") {
    return 1;
  }
  return 2;
}

function planTierLabel(tier: PlanTier): string {
  if (tier === "free") {
    return "Free";
  }
  if (tier === "plus") {
    return "Plus";
  }
  return "Pro";
}

function tierForConfiguredPriceId(
  priceId: string | undefined,
  products:
    | {
        plus?: { id: string } | null;
        pro?: { id: string } | null;
      }
    | null
    | undefined,
): PlanTier | null {
  if (!priceId || !products) {
    return null;
  }
  if (products.plus?.id === priceId) {
    return "plus";
  }
  if (products.pro?.id === priceId) {
    return "pro";
  }
  return null;
}

function formatStripeRecurringPrice(
  product: StripePlanPrice | undefined,
): string | undefined {
  const price = getStripeRecurringPrice(product);
  if (!price) {
    return undefined;
  }

  return formatCurrencyFromMinorUnits(price.amount, price.currency);
}

function getStripeRecurringPrice(product: StripePlanPrice | undefined):
  | {
      amount: number;
      currency: string;
    }
  | undefined {
  if (!product || typeof product.amount !== "number") {
    return undefined;
  }
  if (product.amount < 0) {
    return undefined;
  }
  return {
    amount: product.amount,
    currency: (product.currency ?? "USD").toUpperCase(),
  };
}

function formatCurrencyFromMinorUnits(
  amount: number,
  currency: string,
): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount / 100);
  } catch {
    return `$${String(amount / 100)}`;
  }
}

function getProratedUpgradeBreakdown({
  currentProduct,
  targetProduct,
  periodStart,
  periodEnd,
}: {
  currentProduct: StripePlanPrice | undefined;
  targetProduct: StripePlanPrice | undefined;
  periodStart: number | undefined;
  periodEnd: number | undefined;
}):
  | {
      currentCredit: string;
      currentMonthlyPrice: string;
      targetCharge: string;
      targetMonthlyPrice: string;
      dueToday: string;
      effectiveDate: string;
    }
  | undefined {
  const currentPrice = getStripeRecurringPrice(currentProduct);
  const targetPrice = getStripeRecurringPrice(targetProduct);
  const currentAmount = currentPrice?.amount;
  const targetAmount = targetPrice?.amount;
  const targetCurrency = targetPrice?.currency;
  const periodDuration =
    typeof periodStart === "number" && typeof periodEnd === "number"
      ? periodEnd - periodStart
      : undefined;
  if (
    typeof currentAmount !== "number" ||
    typeof targetAmount !== "number" ||
    typeof targetCurrency !== "string" ||
    currentPrice?.currency !== targetCurrency ||
    typeof periodDuration !== "number" ||
    typeof periodEnd !== "number" ||
    periodDuration <= 0
  ) {
    return undefined;
  }

  const remainingRatio = Math.min(
    1,
    Math.max(0, (periodEnd - Date.now()) / periodDuration),
  );
  const priceDifference = targetAmount - currentAmount;
  if (priceDifference <= 0) {
    return undefined;
  }

  const currentCredit = Math.round(currentAmount * remainingRatio);
  const targetCharge = Math.round(targetAmount * remainingRatio);
  const dueToday = targetCharge - currentCredit;
  if (dueToday <= 0) {
    return undefined;
  }

  return {
    currentCredit: `-${formatCurrencyFromMinorUnits(currentCredit, targetCurrency)}`,
    currentMonthlyPrice: formatCurrencyFromMinorUnits(
      currentAmount,
      targetCurrency,
    ),
    targetCharge: formatCurrencyFromMinorUnits(targetCharge, targetCurrency),
    targetMonthlyPrice: formatCurrencyFromMinorUnits(
      targetAmount,
      targetCurrency,
    ),
    dueToday: formatCurrencyFromMinorUnits(dueToday, targetCurrency),
    effectiveDate: new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
    }).format(Date.now()),
  };
}

function renewalSummary(periodEnd: number | undefined): string | null {
  if (typeof periodEnd !== "number") {
    return null;
  }
  const days = Math.max(0, Math.ceil((periodEnd - Date.now()) / 86_400_000));
  const dateStr = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(periodEnd);
  return `${dateStr} (${days}d)`;
}

/** Convex action payloads are loosely typed from generated API; coerce for React state safely. */
function coerceSubscriptionSchedule(input: unknown): {
  cancelAtPeriodEnd: boolean;
  pendingPriceId: string | undefined;
  pendingAppliesAtMs: number | undefined;
} {
  if (!input || typeof input !== "object") {
    return {
      cancelAtPeriodEnd: false,
      pendingPriceId: undefined,
      pendingAppliesAtMs: undefined,
    };
  }
  const schedule = input as Record<string, unknown>;
  return {
    cancelAtPeriodEnd: schedule.cancelAtPeriodEnd === true,
    pendingPriceId:
      typeof schedule.pendingPriceId === "string"
        ? schedule.pendingPriceId
        : undefined,
    pendingAppliesAtMs:
      typeof schedule.pendingAppliesAtMs === "number"
        ? schedule.pendingAppliesAtMs
        : undefined,
  };
}

function RouteComponent() {
  const stripePrices = useQuery(api.functions.billing.getConfiguredStripePrices, {});
  const getStripePriceDetails = useAction(
    api.functions.billing.getConfiguredStripePriceDetails,
  );
  const baseBillingState = useQuery(
    api.functions.billing.getCurrentBillingState,
    {},
  );
  const createSubscriptionCheckout = useAction(
    api.functions.billing.createCurrentUserSubscriptionCheckout,
  );
  const createCustomerPortal = useAction(
    api.functions.billing.createCurrentUserCustomerPortal,
  );
  const refreshBillingStatus = useAction(
    api.functions.billing.refreshCurrentUserBillingState,
  );
  const switchPaidPlan = useAction(
    api.functions.billing.switchCurrentUserPaidPlan,
  );
  const rescindCancellation = useAction(
    api.functions.billing.rescindPaidSubscriptionCancellation,
  );
  const discardPendingPlanChange = useAction(
    api.functions.billing.discardScheduledPaidPlanChange,
  );
  const [billingError, setBillingError] = useState<string | null>(null);
  const [planSwitchConfirm, setPlanSwitchConfirm] = useState<{
    priceId: string;
    planName: string;
    isUpgrade: boolean;
  } | null>(null);
  const [checkoutLoadingPriceId, setCheckoutLoadingPriceId] = useState<
    string | null
  >(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [stripePriceDetails, setStripePriceDetails] =
    useState<StripePriceConfig | null>(null);
  const [planSwitchLoading, setPlanSwitchLoading] = useState(false);
  const [liveSubscriptionSchedule, setLiveSubscriptionSchedule] = useState<
    | {
        cancelAtPeriodEnd: boolean;
        pendingPriceId: string | undefined;
        pendingAppliesAtMs: number | undefined;
      }
    | undefined
  >(undefined);
  const [billingScheduleMutation, setBillingScheduleMutation] = useState<
    "rescind" | "discard" | null
  >(null);
  const [addCreditsOpen, setAddCreditsOpen] = useState(false);

  const hydratedScheduleForSubIdRef = useRef<string | null>(null);
  const billingQuerySettled = baseBillingState !== undefined;
  const subscriptionIdForHydration =
    baseBillingState?.subscription?.subscriptionId;

  useEffect(() => {
    if (!billingQuerySettled) {
      return;
    }
    if (!subscriptionIdForHydration) {
      hydratedScheduleForSubIdRef.current = null;
      return;
    }
    if (hydratedScheduleForSubIdRef.current === subscriptionIdForHydration) {
      return;
    }
    hydratedScheduleForSubIdRef.current = subscriptionIdForHydration;
    let cancelled = false;
    void refreshBillingStatus({}).then((result) => {
      if (cancelled) {
        return;
      }
      setLiveSubscriptionSchedule(
        coerceSubscriptionSchedule(result.subscriptionSchedule),
      );
    });
    return () => {
      cancelled = true;
      hydratedScheduleForSubIdRef.current = null;
    };
  }, [billingQuerySettled, subscriptionIdForHydration, refreshBillingStatus]);

  const billingState = baseBillingState;
  const configuredStripePrices = stripePriceDetails ?? stripePrices;

  const includedMonthlyCredits =
    typeof billingState?.includedMonthlyCredits === "number"
      ? billingState.includedMonthlyCredits
      : undefined;

  const currentTier = billingState?.tier ?? "free";
  const plusPrice = configuredStripePrices?.plus ?? null;
  const proPrice = configuredStripePrices?.pro ?? null;
  const currentPaidProduct =
    currentTier === "plus"
      ? plusPrice
      : currentTier === "pro"
        ? proPrice
        : null;
  const planSwitchTargetProduct =
    planSwitchConfirm?.priceId === plusPrice?.id
      ? plusPrice
      : planSwitchConfirm?.priceId === proPrice?.id
        ? proPrice
        : null;
  const proratedUpgradeBreakdown = getProratedUpgradeBreakdown({
    currentProduct: currentPaidProduct,
    targetProduct: planSwitchTargetProduct,
    periodStart: billingState?.currentPeriodStart,
    periodEnd: billingState?.currentPeriodEnd,
  });
  const subscriptionId = billingState?.subscription?.subscriptionId;
  const effectiveLiveSubscriptionSchedule =
    subscriptionId != null && subscriptionId !== ""
      ? liveSubscriptionSchedule
      : undefined;
  const showPaidManage = tierRank(currentTier) >= 1;
  const isOnPaidPlan = showPaidManage;

  const renewSummary = renewalSummary(billingState?.currentPeriodEnd);

  const rank = tierRank(currentTier);

  const cancelAtPeriodEndMerged =
    effectiveLiveSubscriptionSchedule !== undefined
      ? effectiveLiveSubscriptionSchedule.cancelAtPeriodEnd
      : baseBillingState?.subscription?.cancelAtPeriodEnd === true;

  const scheduleNotice = useMemo(() => {
    if (!billingState) {
      return null;
    }

    if (configuredStripePrices) {
      const pendingId = effectiveLiveSubscriptionSchedule?.pendingPriceId;
      const pendingTier = tierForConfiguredPriceId(
        pendingId,
        configuredStripePrices,
      );
      const whenRaw =
        pendingId != null && pendingId !== ""
          ? (effectiveLiveSubscriptionSchedule?.pendingAppliesAtMs ??
            billingState.currentPeriodEnd)
          : undefined;
      const whenPhrase = renewalSummary(whenRaw);

      if (pendingId && pendingTier !== null && pendingTier !== currentTier) {
        const when =
          whenPhrase ??
          (billingState.currentPeriodEnd != null
            ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                billingState.currentPeriodEnd,
              )
            : "your next renewal");
        return `Starting ${when}, your plan will change from ${planTierLabel(currentTier)} to ${planTierLabel(pendingTier)}. Until then you keep ${planTierLabel(currentTier)} benefits.`;
      }

      if (pendingId && pendingTier === null) {
        const when = whenPhrase ?? "your next renewal";
        return `You have a scheduled plan change on ${when}.`;
      }
    }

    if (cancelAtPeriodEndMerged && rank >= 1) {
      const when = renewSummary ?? "the end of this billing period";
      return `Your paid subscription is set to cancel after ${when} and will not renew. You can change this in Manage billing or by choosing a plan below.`;
    }

    return null;
  }, [
    configuredStripePrices,
    billingState,
    effectiveLiveSubscriptionSchedule,
    currentTier,
    cancelAtPeriodEndMerged,
    rank,
    renewSummary,
  ]);

  const pendingPriceIdLive =
    effectiveLiveSubscriptionSchedule?.pendingPriceId;
  const pendingTierLive = tierForConfiguredPriceId(
    pendingPriceIdLive,
    configuredStripePrices,
  );

  const showRescindCancellation =
    cancelAtPeriodEndMerged && rank >= 1 && Boolean(subscriptionId);

  const hasPendingPlanChange =
    rank >= 1 &&
    Boolean(subscriptionId) &&
    pendingPriceIdLive != null &&
    pendingPriceIdLive !== "" &&
    (configuredStripePrices == null ||
      pendingTierLive === null ||
      pendingTierLive !== currentTier);

  const showBillingSchedulePanel =
    scheduleNotice !== null || showRescindCancellation || hasPendingPlanChange;

  const stayOnPlanButtonLabel =
    pendingTierLive === null || !configuredStripePrices
      ? "Keep current plan at renewal"
      : `Stay on ${planTierLabel(currentTier)}`;

  useEffect(() => {
    let cancelled = false;
    void getStripePriceDetails({})
      .then((prices) => {
        if (!cancelled) {
          setStripePriceDetails(prices);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load Stripe price details", error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getStripePriceDetails]);

  const applyBillingScheduleRefresh = async () => {
    const result = await refreshBillingStatus({});
    setLiveSubscriptionSchedule(
      coerceSubscriptionSchedule(result.subscriptionSchedule),
    );
  };

  const runRescindCancellation = async () => {
    setBillingScheduleMutation("rescind");
    setBillingError(null);
    try {
      await rescindCancellation({});
      await applyBillingScheduleRefresh();
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Could not resume your subscription renewal",
      );
    } finally {
      setBillingScheduleMutation(null);
    }
  };

  const runDiscardPendingPlanChange = async () => {
    setBillingScheduleMutation("discard");
    setBillingError(null);
    try {
      await discardPendingPlanChange({});
      await applyBillingScheduleRefresh();
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Could not clear the scheduled plan change",
      );
    } finally {
      setBillingScheduleMutation(null);
    }
  };

  const confirmPlanSwitch = async () => {
    if (!planSwitchConfirm) {
      return;
    }
    const { priceId } = planSwitchConfirm;
    const periodEndAtConfirm = billingState?.currentPeriodEnd;
    const cancelAtPeriodEndAtConfirm =
      baseBillingState?.subscription?.cancelAtPeriodEnd === true;

    setPlanSwitchLoading(true);
    setBillingError(null);
    try {
      const switchResult = await switchPaidPlan({ priceId });
      setPlanSwitchConfirm(null);

      if (switchResult.prorationBehavior === "next_period") {
        setLiveSubscriptionSchedule({
          cancelAtPeriodEnd: cancelAtPeriodEndAtConfirm,
          pendingPriceId: priceId,
          pendingAppliesAtMs: periodEndAtConfirm,
        });
      }

      const result = await refreshBillingStatus({});
      const refreshed = coerceSubscriptionSchedule(result.subscriptionSchedule);

      setLiveSubscriptionSchedule((prev) => {
        if (switchResult.prorationBehavior === "next_period") {
          if (
            typeof refreshed.pendingPriceId === "string" &&
            refreshed.pendingPriceId !== ""
          ) {
            return refreshed;
          }
          return {
            cancelAtPeriodEnd: refreshed.cancelAtPeriodEnd,
            pendingPriceId: priceId,
            pendingAppliesAtMs:
              refreshed.pendingAppliesAtMs ??
              prev?.pendingAppliesAtMs ??
              (typeof periodEndAtConfirm === "number"
                ? periodEndAtConfirm
                : undefined),
          };
        }
        return refreshed;
      });
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Plan switch failed",
      );
    } finally {
      setPlanSwitchLoading(false);
    }
  };

  const subscribeToPrice = async (priceId: string) => {
    setCheckoutLoadingPriceId(priceId);
    setBillingError(null);
    try {
      const checkout = await createSubscriptionCheckout({ priceId });
      window.location.href = checkout.url;
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Could not create checkout",
      );
      setCheckoutLoadingPriceId(null);
    }
  };

  const openCustomerPortal = async () => {
    setPortalLoading(true);
    setBillingError(null);
    try {
      const portal = await createCustomerPortal({});
      window.location.href = portal.url;
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Could not open billing portal",
      );
      setPortalLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
        <div className="flex items-center gap-2">
          {showPaidManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "h-8 gap-1 px-2.5 text-xs",
              )}
              disabled={portalLoading}
              onClick={() => void openCustomerPortal()}
            >
              {portalLoading ? "Opening..." : "Manage billing"}
              <ChevronRight className="size-3.5 opacity-60" aria-hidden />
            </Button>
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
            <DialogTitle>
              {planSwitchConfirm?.isUpgrade
                ? `Upgrade to ${planSwitchConfirm.planName}`
                : `Switch to ${planSwitchConfirm?.planName}?`}
            </DialogTitle>
            <DialogDescription>
              {planSwitchConfirm?.isUpgrade ? (
                proratedUpgradeBreakdown ? (
                  <>
                    Your new plan starts right away. Your card will be charged
                    for the prorated amount below.
                  </>
                ) : (
                  <>
                    Your new plan starts right away. You&apos;ll be charged a
                    prorated amount for the rest of this billing period. After
                    that, you&apos;ll pay the usual renewal price.
                  </>
                )
              ) : (
                <>
                  You will be downgraded to {planSwitchConfirm?.planName} at the
                  end of this billing cycle.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {planSwitchConfirm?.isUpgrade && proratedUpgradeBreakdown ? (
            <div className="ring-border bg-muted/25 space-y-4 rounded-lg p-4 ring-1">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <span>
                    Unused {planTierLabel(currentTier)} -{" "}
                    {proratedUpgradeBreakdown.currentMonthlyPrice}/mo (from{" "}
                    {proratedUpgradeBreakdown.effectiveDate})
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {proratedUpgradeBreakdown.currentCredit}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-4">
                  <span>
                    {planSwitchConfirm.planName} -{" "}
                    {proratedUpgradeBreakdown.targetMonthlyPrice}/mo (from{" "}
                    {proratedUpgradeBreakdown.effectiveDate})
                  </span>
                  <span className="font-mono font-semibold tabular-nums">
                    {proratedUpgradeBreakdown.targetCharge}
                  </span>
                </div>
              </div>
              <div className="border-border flex items-center justify-between gap-4 border-t pt-4 text-base font-semibold">
                <span>Due today</span>
                <span className="font-mono tabular-nums">
                  {proratedUpgradeBreakdown.dueToday}
                </span>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPlanSwitchConfirm(null)}
              disabled={planSwitchLoading}
            >
              {planSwitchConfirm?.isUpgrade
                ? `Stay on ${planTierLabel(currentTier)}`
                : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={() => void confirmPlanSwitch()}
              disabled={planSwitchLoading}
            >
              {planSwitchLoading
                ? planSwitchConfirm?.isUpgrade
                  ? "Upgrading…"
                  : "Switching…"
                : planSwitchConfirm?.isUpgrade
                  ? "Confirm"
                  : "Confirm switch"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddCreditsDialog
        open={addCreditsOpen}
        onOpenChange={setAddCreditsOpen}
        billingState={billingState}
        triggerContext="settings"
      />

      <div className="space-y-2">
        <CreditBalancePanel
          bucketBalances={billingState?.bucketBalances}
          expiringSoon={billingState?.expiringSoon}
          includedMonthlyCredits={includedMonthlyCredits}
          currentPeriodStart={billingState?.currentPeriodStart}
          currentPeriodEnd={billingState?.currentPeriodEnd}
        />
        <div className="flex justify-end">
          <CreditGrantHistoryDialog />
        </div>
      </div>

      {isOnPaidPlan ? (
        <section className="space-y-3">
          <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
            Credit top-up
          </p>
          <Card className="bg-muted/35 ring-border gap-0 px-5 py-4 shadow-none">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">Add more credits</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Purchased credits are spent after monthly credits and do not
                  expire.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 gap-2 text-xs"
                onClick={() => setAddCreditsOpen(true)}
              >
                <CreditCard className="size-3.5" aria-hidden />
                Add credits
              </Button>
            </div>
          </Card>
        </section>
      ) : null}

      <section id="plans" className="scroll-mt-6 space-y-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Plans
        </p>
        {showBillingSchedulePanel ? (
          <Card className="bg-primary/4 ring-primary/30 gap-0 px-5 py-3 text-sm leading-relaxed">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                {scheduleNotice ? (
                  <p className="m-0">{scheduleNotice}</p>
                ) : null}
              </div>
              {showRescindCancellation || hasPendingPlanChange ? (
                <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                  {showRescindCancellation ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs whitespace-nowrap"
                      disabled={
                        billingScheduleMutation !== null || planSwitchLoading
                      }
                      onClick={() => void runRescindCancellation()}
                    >
                      {billingScheduleMutation === "rescind"
                        ? "Updating…"
                        : "Undo cancellation"}
                    </Button>
                  ) : null}
                  {hasPendingPlanChange ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs whitespace-nowrap"
                      disabled={
                        billingScheduleMutation !== null || planSwitchLoading
                      }
                      onClick={() => void runDiscardPendingPlanChange()}
                    >
                      {billingScheduleMutation === "discard"
                        ? "Updating…"
                        : stayOnPlanButtonLabel}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-3">
          <TierColumn
            name="Free"
            plan={getPlanConfig("free", billingConfig)}
            state={rank === 0 ? "current" : "inactive"}
            buttonLabel="Free"
            renewalSummary={renewSummary}
          />
          <TierColumn
            name="Plus"
            plan={getPlanConfig("plus", billingConfig)}
            priceLabel={formatStripeRecurringPrice(plusPrice ?? undefined)}
            state={
              rank === 1 ? "current" : rank === 0 ? "available" : "available"
            }
            priceId={plusPrice?.id}
            buttonLabel="Plus"
            emphasize={rank === 0}
            renewalSummary={renewSummary}
            checkoutLoading={checkoutLoadingPriceId === plusPrice?.id}
            onSubscribe={
              plusPrice?.id
                ? () => void subscribeToPrice(plusPrice.id)
                : undefined
            }
            paidSwitch={
              isOnPaidPlan && rank === 2 && plusPrice?.id
                ? {
                    isUpgrade: false,
                    onRequest: () =>
                      setPlanSwitchConfirm({
                        priceId: plusPrice.id,
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
            priceLabel={formatStripeRecurringPrice(proPrice ?? undefined)}
            state={rank === 2 ? "current" : rank < 2 ? "available" : "inactive"}
            priceId={proPrice?.id}
            buttonLabel="Pro"
            emphasize={rank === 1}
            renewalSummary={renewSummary}
            checkoutLoading={checkoutLoadingPriceId === proPrice?.id}
            onSubscribe={
              proPrice?.id ? () => void subscribeToPrice(proPrice.id) : undefined
            }
            paidSwitch={
              isOnPaidPlan && rank === 1 && proPrice?.id
                ? {
                    isUpgrade: true,
                    onRequest: () =>
                      setPlanSwitchConfirm({
                        priceId: proPrice.id,
                        planName: "Pro",
                        isUpgrade: true,
                      }),
                  }
                : undefined
            }
          />
        </div>
      </section>

      {billingError ? (
        <p className="text-destructive text-sm" role="alert">
          {billingError}
        </p>
      ) : null}
    </div>
  );
}

function TierColumn({
  name,
  plan,
  priceLabel,
  state,
  priceId,
  emphasize,
  buttonLabel,
  renewalSummary: renewalLine,
  checkoutLoading,
  onSubscribe,
  paidSwitch,
}: {
  name: string;
  plan: ReturnType<typeof getPlanConfig>;
  priceLabel?: string;
  state: "current" | "available" | "inactive";
  priceId?: string;
  emphasize?: boolean;
  buttonLabel?: string;
  renewalSummary?: string | null;
  checkoutLoading?: boolean;
  onSubscribe?: () => void;
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
      <Button
        disabled
        variant="outline"
        size="sm"
        className="mt-auto w-full text-xs"
      >
        Current plan
      </Button>
    ) : state === "inactive" ? (
      <div className="mt-auto pt-6" aria-hidden />
    ) : priceId !== undefined && paidSwitch ? (
      <Button
        type="button"
        variant={emphasize ? "default" : "outline"}
        size="sm"
        className={cn("mt-auto w-full text-xs", !emphasize && "bg-transparent")}
        onClick={paidSwitch.onRequest}
      >
        {paidSwitch.isUpgrade
          ? `Upgrade to ${buttonLabel ?? name}`
          : `Downgrade to ${buttonLabel ?? name}`}
      </Button>
    ) : priceId !== undefined && onSubscribe ? (
      <Button
        type="button"
        variant={emphasize ? "default" : "outline"}
        size="sm"
        className={cn(
          "mt-auto w-full text-xs",
          !emphasize && "bg-transparent",
        )}
        disabled={checkoutLoading}
        onClick={onSubscribe}
      >
        {checkoutLoading ? "Opening..." : `Subscribe to ${buttonLabel ?? name}`}
      </Button>
    ) : (
      <Button
        disabled
        variant="outline"
        size="sm"
        className="mt-auto w-full text-xs"
      >
        Unavailable
      </Button>
    );

  return (
    <Card
      className={cn(
        "bg-muted/35 ring-border flex min-h-[192px] flex-col gap-0 px-5 py-5 shadow-none",
        emphasize && state === "available"
          ? "bg-primary/3 ring-primary/40 ring-1"
          : null,
      )}
    >
      <p className="text-base font-semibold">{name}</p>
      <p className="text-foreground mt-1 font-mono text-lg font-semibold tabular-nums">
        {priced}
      </p>
      {state === "current" ? (
        renewalLine != null ? (
          <p className="text-muted-foreground mt-2 text-xs">
            Renews {renewalLine}
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 text-xs">
            Renewal details are loading.
          </p>
        )
      ) : null}
      <ul className="text-muted-foreground mt-3 flex-1 space-y-1.5 text-xs leading-relaxed">
        <li>{formatNumber(plan.includedMonthlyCredits)} credits / period</li>
        {/* TODO: finish this */}
      </ul>
      {footer}
    </Card>
  );
}
