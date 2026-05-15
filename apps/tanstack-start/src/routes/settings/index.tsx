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

type StripeCustomerBalanceSummary = {
  balanceCount: number;
  balances: {
    amount: number;
    currency: string;
  }[];
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

function formatStripeCustomerBalance(
  balances: StripeCustomerBalanceSummary["balances"],
): string {
  if (balances.length === 0) {
    return formatCurrencyFromMinorUnits(0, "USD");
  }
  return balances
    .map((balance) =>
      formatCurrencyFromMinorUnits(balance.amount, balance.currency),
    )
    .join(" / ");
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
  const stripePrices = useQuery(
    api.functions.billing.getConfiguredStripePrices,
    {},
  );
  const getStripePriceDetails = useAction(
    api.functions.billing.getConfiguredStripePriceDetails,
  );
  const getStripeCustomerBalance = useAction(
    api.functions.billing.getCurrentUserStripeCustomerBalance,
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
  const [stripeCustomerBalance, setStripeCustomerBalance] =
    useState<StripeCustomerBalanceSummary | null>(null);
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
  const showStripeCustomerBalance =
    stripeCustomerBalance !== null && stripeCustomerBalance.balanceCount > 0;

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

  const pendingPriceIdLive = effectiveLiveSubscriptionSchedule?.pendingPriceId;
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

  useEffect(() => {
    let cancelled = false;
    void getStripeCustomerBalance({})
      .then((customerBalance) => {
        if (!cancelled) {
          setStripeCustomerBalance(customerBalance);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load Stripe customer balance", error);
          setStripeCustomerBalance(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getStripeCustomerBalance]);

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
        error instanceof Error
          ? error.message
          : "Could not open billing portal",
      );
      setPortalLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 pb-16 md:gap-14">
      <header className="flex flex-col gap-6 pb-2 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="max-w-xl space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight md:text-[1.65rem]">
            Billing
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-1">
          {showPaidManage ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                "border-border/60 hover:bg-accent/60 h-9 gap-1 rounded-full px-4 text-xs font-medium shadow-none",
              )}
              disabled={portalLoading}
              onClick={() => void openCustomerPortal()}
            >
              {portalLoading ? "Opening…" : "Manage billing"}
              <ChevronRight className="size-3.5 opacity-50" aria-hidden />
            </Button>
          ) : null}
        </div>
      </header>

      {billingError ? (
        <div
          className="border-destructive/35 bg-destructive/10 text-destructive rounded-2xl border px-4 py-3 text-sm leading-snug"
          role="alert"
        >
          {billingError}
        </div>
      ) : null}

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

      <article className="flex flex-col gap-4 md:gap-5">
        <CreditBalancePanel
          bucketBalances={billingState?.bucketBalances}
          expiringSoon={billingState?.expiringSoon}
          includedMonthlyCredits={includedMonthlyCredits}
          currentPeriodStart={billingState?.currentPeriodStart}
          currentPeriodEnd={billingState?.currentPeriodEnd}
          footer={
            <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2">
              <div className="flex shrink-0 items-center">
                {isOnPaidPlan ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 text-xs font-medium shadow-none"
                    onClick={() => setAddCreditsOpen(true)}
                  >
                    <CreditCard className="size-3.5 opacity-90" aria-hidden />
                    Add credits
                  </Button>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center">
                <CreditGrantHistoryDialog />
              </div>
            </div>
          }
        />

        {showStripeCustomerBalance ? (
          <Card className="border-border/50 bg-card/55 gap-0 rounded-2xl border px-5 py-4 shadow-none">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold tracking-tight">
                  Invoice credits (Stripe)
                </p>
                <p className="text-muted-foreground text-xs leading-snug">
                  Will apply on your next invoice.
                </p>
              </div>
              <span className="font-mono text-xl font-semibold tabular-nums">
                {formatStripeCustomerBalance(stripeCustomerBalance.balances)}
              </span>
            </div>
          </Card>
        ) : null}
      </article>

      <section id="plans" className="scroll-mt-10 space-y-5">
        <div className="space-y-1">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
            Plans
          </p>
          <p className="text-muted-foreground text-xs">
            Upgrade or downgrade takes effect immediately or next cycle
            depending on your choice — details appear in the confirmation step.
          </p>
        </div>
        {showBillingSchedulePanel ? (
          <Card className="border-primary/25 bg-primary/6 ring-primary/15 gap-0 rounded-2xl border px-5 py-4 text-sm leading-relaxed shadow-none ring-1">
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
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
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
              proPrice?.id
                ? () => void subscribeToPrice(proPrice.id)
                : undefined
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
        className="border-border/60 mt-auto h-10 w-full rounded-full text-xs font-medium"
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
        className={cn(
          "mt-auto h-10 w-full rounded-full text-xs font-medium",
          !emphasize && "border-border/60 bg-transparent",
        )}
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
          "mt-auto h-10 w-full rounded-full text-xs font-medium",
          !emphasize && "border-border/60 bg-transparent",
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
        className="border-border/60 mt-auto h-10 w-full rounded-full text-xs font-medium"
      >
        Unavailable
      </Button>
    );

  return (
    <Card
      className={cn(
        "border-border/50 bg-card/50 flex min-h-[220px] flex-col gap-0 rounded-2xl border px-5 py-6 shadow-none",
        state === "current" &&
          "border-primary/25 bg-primary/6 ring-primary/15 ring-1",
        emphasize && state === "available" && "border-primary/30 shadow-sm",
      )}
    >
      <p className="text-lg font-semibold tracking-tight">{name}</p>
      <p className="text-foreground mt-2 font-mono text-xl font-semibold tracking-tight tabular-nums">
        {priced}
      </p>
      {state === "current" ? (
        renewalLine != null ? (
          <p className="text-muted-foreground mt-2 text-[11px] leading-snug">
            Renews {renewalLine}
          </p>
        ) : (
          <p className="text-muted-foreground mt-2 text-[11px] leading-snug">
            Renewal details are loading.
          </p>
        )
      ) : null}
      <ul className="text-muted-foreground mt-5 flex-1 space-y-2 text-xs leading-snug">
        <li className="flex gap-2.5">
          <span className="text-primary mt-1.5 size-1 shrink-0 rounded-full bg-current" />
          <span className="min-w-0">
            <span className="text-foreground font-medium">
              {formatNumber(plan.includedMonthlyCredits)}
            </span>{" "}
            credits per billing period
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="text-primary mt-1.5 size-1 shrink-0 rounded-full bg-current" />
          <span className="min-w-0">
            Usage multiplier{" "}
            <span className="text-foreground font-mono font-medium tabular-nums">
              {plan.markupMultiplier}×
            </span>
            <span className="sr-only">
              {" "}
              Credits charged toward AI usage versus raw model cost for this
              tier.
            </span>
          </span>
        </li>
        <li className="flex gap-2.5">
          <span className="text-primary mt-1.5 size-1 shrink-0 rounded-full bg-current" />
          <span className="min-w-0">
            {plan.overageAllowed
              ? "Overage billed when you exceed included credits."
              : "Hard cap — chat pauses once included credits run out."}
          </span>
        </li>
      </ul>
      <div className="mt-6">{footer}</div>
    </Card>
  );
}
