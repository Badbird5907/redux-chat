import type { StripePlanPrice } from "@/components/billing/plan-tier-marketing-card";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { ChevronRight, CreditCard, TriangleAlert } from "lucide-react";

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

import { AddCreditsDialog } from "@/components/billing/add-credits-dialog";
import { CreditBalancePanel } from "@/components/billing/credit-balance-panel";
import { CreditGrantHistoryDialog } from "@/components/billing/credit-grant-history";
import {
  formatStripeRecurringPrice,
  PlanTierMarketingCard,
} from "@/components/billing/plan-tier-marketing-card";
import { SettingsMobileSidebarTrigger } from "@/components/settings/settings-mobile-sidebar-trigger";
import { useQuery } from "@/lib/hooks/convex";

export const Route = createFileRoute("/settings/")({
  component: RouteComponent,
});

const billingConfig = DEFAULT_BILLING_CONFIG;

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

type PaidPlanSwitchPreview = {
  prorationDate: number;
  currency: string;
  subtotal: number;
  total: number;
  amountDue: number;
  startingBalance: number;
  prorationSubtotal: number;
  prorationCredit: number;
  prorationCharge: number;
  otherInvoiceAmount: number;
  lines: {
    id: string;
    description: string;
    amount: number;
    currency: string;
    periodStart: number | undefined;
    periodEnd: number | undefined;
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

function formatSignedCurrencyFromMinorUnits(
  amount: number,
  currency: string,
): string {
  if (amount < 0) {
    return `-${formatCurrencyFromMinorUnits(Math.abs(amount), currency)}`;
  }
  return formatCurrencyFromMinorUnits(amount, currency);
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
  const getPaymentMethodStatus = useAction(
    api.functions.billing.getCurrentUserPaymentMethodStatus,
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
  const previewPaidPlanSwitch = useAction(
    api.functions.billing.previewCurrentUserPaidPlanSwitch,
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
  const [planSwitchPreview, setPlanSwitchPreview] = useState<{
    priceId: string;
    loading: boolean;
    data: PaidPlanSwitchPreview | null;
    error: string | null;
  } | null>(null);
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
  const [addPaymentMethodDialogOpen, setAddPaymentMethodDialogOpen] =
    useState(false);
  const [hasPaymentMethod, setHasPaymentMethod] = useState<boolean | null>(
    null,
  );

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
  const subscriptionId = billingState?.subscription?.subscriptionId;
  const activePlanSwitchPreview =
    planSwitchConfirm?.isUpgrade === true &&
    planSwitchPreview?.priceId === planSwitchConfirm.priceId
      ? planSwitchPreview
      : null;
  const upgradePreviewHasAmount =
    activePlanSwitchPreview?.data != null &&
    (activePlanSwitchPreview.data.prorationCharge > 0 ||
      activePlanSwitchPreview.data.prorationCredit > 0 ||
      activePlanSwitchPreview.data.amountDue > 0 ||
      activePlanSwitchPreview.data.total !== 0);
  const effectiveLiveSubscriptionSchedule =
    subscriptionId != null && subscriptionId !== ""
      ? liveSubscriptionSchedule
      : undefined;
  const showPaidManage = tierRank(currentTier) >= 1;
  const isOnPaidPlan = showPaidManage;
  const showMissingPaymentMethodNag =
    isOnPaidPlan && hasPaymentMethod === false;

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

  useEffect(() => {
    let cancelled = false;
    if (!isOnPaidPlan) {
      return;
    }
    void getPaymentMethodStatus({})
      .then((result) => {
        if (!cancelled) {
          setHasPaymentMethod(result.hasPaymentMethod);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load payment method status", error);
          setHasPaymentMethod(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOnPaidPlan, getPaymentMethodStatus]);

  useEffect(() => {
    const confirm = planSwitchConfirm;
    if (!confirm?.isUpgrade) {
      return;
    }

    let cancelled = false;
    void previewPaidPlanSwitch({ priceId: confirm.priceId })
      .then((preview) => {
        if (!cancelled) {
          setPlanSwitchPreview({
            priceId: confirm.priceId,
            loading: false,
            data: preview,
            error: null,
          });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setPlanSwitchPreview({
            priceId: confirm.priceId,
            loading: false,
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "Could not load the Stripe invoice preview.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [planSwitchConfirm, previewPaidPlanSwitch]);

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
      const switchResult = await switchPaidPlan({
        priceId,
        prorationDate:
          planSwitchConfirm.isUpgrade &&
          activePlanSwitchPreview?.priceId === priceId
            ? (activePlanSwitchPreview.data?.prorationDate ?? undefined)
            : undefined,
      });
      setPlanSwitchConfirm(null);
      setPlanSwitchPreview(null);

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
      <header className="flex flex-row items-center justify-between gap-3 pb-2 sm:gap-8">
        <div className="flex max-w-xl min-w-0 flex-1 items-center gap-2">
          <SettingsMobileSidebarTrigger />
          <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:text-[1.65rem]">
            Billing
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {showPaidManage ? (
            <Button
              type="button"
              variant="outline"
              disabled={portalLoading}
              onClick={() => void openCustomerPortal()}
            >
              {portalLoading ? "Opening…" : "Manage billing"}
              <ChevronRight className="opacity-50" aria-hidden />
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

      {showMissingPaymentMethodNag ? (
        <Card className="gap-0 border-amber-500/30 bg-amber-500/5 px-5 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex items-center gap-2 text-sm font-semibold tracking-tight">
                <TriangleAlert className="size-4" aria-hidden />
                Add a billing method to keep your plan active
              </p>
              <p className="text-muted-foreground text-xs leading-snug">
                You are on a paid plan without a payment method on file. Add one
                now so your plan can renew when your gifted period ends.
              </p>
            </div>
            <div className="shrink-0">
              <Button
                type="button"
                variant="outline"
                className="whitespace-nowrap"
                onClick={() => setAddPaymentMethodDialogOpen(true)}
              >
                Add billing method
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Dialog
        open={planSwitchConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !planSwitchLoading) {
            setPlanSwitchConfirm(null);
            setPlanSwitchPreview(null);
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
                <>
                  Your new plan starts right away. Stripe calculates the exact
                  prorated invoice before you confirm.
                </>
              ) : (
                <>
                  You will be downgraded to {planSwitchConfirm?.planName} at the
                  end of this billing cycle.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {planSwitchConfirm?.isUpgrade ? (
            <div className="ring-border bg-muted/25 space-y-4 rounded-lg p-4 ring-1">
              {activePlanSwitchPreview?.error ? (
                <p className="text-destructive text-sm">
                  {activePlanSwitchPreview.error}
                </p>
              ) : activePlanSwitchPreview?.data && upgradePreviewHasAmount ? (
                <>
                  <div className="space-y-3 text-sm">
                    {activePlanSwitchPreview.data.prorationCredit > 0 ? (
                      <div className="flex items-start justify-between gap-4">
                        <span>Unused {planTierLabel(currentTier)} credit</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatSignedCurrencyFromMinorUnits(
                            -activePlanSwitchPreview.data.prorationCredit,
                            activePlanSwitchPreview.data.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                    {activePlanSwitchPreview.data.prorationCharge > 0 ? (
                      <div className="flex items-start justify-between gap-4">
                        <span>
                          {planSwitchConfirm.planName} prorated charge
                        </span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatCurrencyFromMinorUnits(
                            activePlanSwitchPreview.data.prorationCharge,
                            activePlanSwitchPreview.data.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                    {activePlanSwitchPreview.data.otherInvoiceAmount !== 0 ? (
                      <div className="flex items-start justify-between gap-4">
                        <span>Taxes, discounts, or invoice adjustments</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatSignedCurrencyFromMinorUnits(
                            activePlanSwitchPreview.data.otherInvoiceAmount,
                            activePlanSwitchPreview.data.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                    {activePlanSwitchPreview.data.startingBalance < 0 ? (
                      <div className="flex items-start justify-between gap-4">
                        <span>Invoice credits applied</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatSignedCurrencyFromMinorUnits(
                            activePlanSwitchPreview.data.startingBalance,
                            activePlanSwitchPreview.data.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="border-border flex items-center justify-between gap-4 border-t pt-4 text-base font-semibold">
                    <span>Due today</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrencyFromMinorUnits(
                        activePlanSwitchPreview.data.amountDue,
                        activePlanSwitchPreview.data.currency,
                      )}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs leading-snug">
                    After this billing period, you&apos;ll pay the usual renewal
                    price for {planSwitchConfirm.planName}.
                  </p>
                </>
              ) : activePlanSwitchPreview?.data ? (
                <p className="text-muted-foreground text-sm">
                  Stripe did not return a payable upgrade preview. Refresh
                  billing and try again.
                </p>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Preparing Stripe invoice preview...
                </p>
              )}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPlanSwitchConfirm(null);
                setPlanSwitchPreview(null);
              }}
              disabled={planSwitchLoading}
            >
              {planSwitchConfirm?.isUpgrade
                ? `Stay on ${planTierLabel(currentTier)}`
                : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={() => void confirmPlanSwitch()}
              disabled={
                planSwitchLoading ||
                (planSwitchConfirm?.isUpgrade === true &&
                  (!activePlanSwitchPreview?.data ||
                    !upgradePreviewHasAmount ||
                    activePlanSwitchPreview.error !== null))
              }
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

      <Dialog
        open={addPaymentMethodDialogOpen}
        onOpenChange={(open) => {
          if (!portalLoading) {
            setAddPaymentMethodDialogOpen(open);
          }
        }}
      >
        <DialogContent showCloseButton={!portalLoading}>
          <DialogHeader>
            <DialogTitle>Add billing method</DialogTitle>
            <DialogDescription>
              You&apos;ll be redirected to Stripe&apos;s billing dashboard to
              add a payment method, then returned to this page.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddPaymentMethodDialogOpen(false)}
              disabled={portalLoading}
            >
              Not now
            </Button>
            <Button
              type="button"
              onClick={() => void openCustomerPortal()}
              disabled={portalLoading}
            >
              {portalLoading ? "Opening…" : "Continue to Stripe"}
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
                    className="shrink-0"
                    onClick={() => setAddCreditsOpen(true)}
                  >
                    <CreditCard className="opacity-90" aria-hidden />
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
          <Card className="bg-card/55 gap-0 px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold tracking-tight">
                  Invoice credits
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
        <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase">
          Plans
        </p>
        {showBillingSchedulePanel ? (
          <Card className="border-primary/25 bg-primary/6 ring-primary/15 gap-0 px-5 py-4 text-sm leading-relaxed ring-1">
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
                      className="whitespace-nowrap"
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
                      className="whitespace-nowrap"
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
  const footer: ReactNode =
    state === "current" ? (
      <Button disabled variant="outline" className="mt-auto w-full">
        Current plan
      </Button>
    ) : state === "inactive" ? (
      <div className="mt-auto pt-6" aria-hidden />
    ) : priceId !== undefined && paidSwitch ? (
      <Button
        type="button"
        variant={emphasize ? "default" : "outline"}
        className="mt-auto w-full"
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
        className="mt-auto w-full"
        disabled={checkoutLoading}
        onClick={onSubscribe}
      >
        {checkoutLoading ? "Opening..." : `Subscribe to ${buttonLabel ?? name}`}
      </Button>
    ) : (
      <Button disabled variant="outline" className="mt-auto w-full">
        Unavailable
      </Button>
    );

  return (
    <PlanTierMarketingCard
      name={name}
      plan={plan}
      priceLabel={priceLabel}
      renewalLine={renewalLine}
      footer={footer}
      state={state}
      emphasize={emphasize}
    />
  );
}
