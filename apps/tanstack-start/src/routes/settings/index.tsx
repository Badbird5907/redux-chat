import { CheckoutLink, CustomerPortalLink } from "@convex-dev/polar/react";
import type { ReactNode } from "react";
import type { CreditBucket, PlanTier } from "@redux/shared";
import {
  CREDIT_BUCKETS,
  DEFAULT_BILLING_CONFIG,
  getPlanConfig,
} from "@redux/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { ChevronRight, Info } from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import { Button, buttonVariants } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";
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
import { Separator } from "@redux/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
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

function planTierLabel(tier: PlanTier): string {
  if (tier === "free") {
    return "Free";
  }
  if (tier === "plus") {
    return "Plus";
  }
  return "Pro";
}

function tierForConfiguredProductId(
  productId: string | undefined,
  products:
    | {
        free?: { id: string } | null;
        plus?: { id: string } | null;
        pro?: { id: string } | null;
      }
    | null
    | undefined,
): PlanTier | null {
  if (!productId || !products) {
    return null;
  }
  if (products.free?.id === productId) {
    return "free";
  }
  if (products.plus?.id === productId) {
    return "plus";
  }
  if (products.pro?.id === productId) {
    return "pro";
  }
  return null;
}

function formatPolarRecurringPrice(
  product:
    | {
        prices?: readonly {
          priceAmount?: number | null;
          priceCurrency?: string | null;
        }[];
      }
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
  const dateStr = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(periodEnd);
  return `${dateStr} (${days}d)`;
}

/** Convex action payloads are loosely typed from generated API; coerce for React state safely. */
function coerceSubscriptionSchedule(input: unknown): {
  cancelAtPeriodEnd: boolean;
  pendingProductId: string | undefined;
  pendingAppliesAtMs: number | undefined;
} {
  if (!input || typeof input !== "object") {
    return {
      cancelAtPeriodEnd: false,
      pendingProductId: undefined,
      pendingAppliesAtMs: undefined,
    };
  }
  const schedule = input as Record<string, unknown>;
  return {
    cancelAtPeriodEnd: schedule.cancelAtPeriodEnd === true,
    pendingProductId:
      typeof schedule.pendingProductId === "string"
        ? schedule.pendingProductId
        : undefined,
    pendingAppliesAtMs:
      typeof schedule.pendingAppliesAtMs === "number"
        ? schedule.pendingAppliesAtMs
        : undefined,
  };
}

type PolarCheckoutApi = {
  generateCheckoutLink: typeof api.polar.generateCheckoutLink;
};

function RouteComponent() {
  const polarProducts = useQuery(api.polar.getConfiguredProducts, {});
  const baseBillingState = useQuery(
    api.functions.billing.getCurrentBillingState,
    {},
  );
  const refreshBillingStatus = useAction(
    api.functions.billing.refreshCurrentUserMeterState,
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
    productId: string;
    planName: string;
    isUpgrade: boolean;
  } | null>(null);
  const [planSwitchLoading, setPlanSwitchLoading] = useState(false);
  const [liveSubscriptionSchedule, setLiveSubscriptionSchedule] = useState<
    | {
        cancelAtPeriodEnd: boolean;
        pendingProductId: string | undefined;
        pendingAppliesAtMs: number | undefined;
      }
    | undefined
  >(undefined);
  const [billingScheduleMutation, setBillingScheduleMutation] = useState<
    "rescind" | "discard" | null
  >(null);

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
  }, [
    billingQuerySettled,
    subscriptionIdForHydration,
    refreshBillingStatus,
  ]);

  const billingState = baseBillingState;

  const includedMonthlyCredits =
    typeof billingState?.includedMonthlyCredits === "number"
      ? billingState.includedMonthlyCredits
      : undefined;

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
  const effectiveLiveSubscriptionSchedule =
    subscriptionId != null && subscriptionId !== ""
      ? liveSubscriptionSchedule
      : undefined;
  const showPaidManage = tierRank(currentTier) >= 1;
  const isOnPaidPlan = showPaidManage;

  const renewSummary = renewalSummary(billingState?.currentPeriodEnd);

  const checkoutAnchorClass =
    "inline-flex h-9 w-full cursor-pointer items-center justify-center rounded-md px-3 text-sm font-medium outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-events-auto";

  const rank = tierRank(currentTier);

  const cancelAtPeriodEndMerged =
    effectiveLiveSubscriptionSchedule !== undefined
      ? effectiveLiveSubscriptionSchedule.cancelAtPeriodEnd
      : baseBillingState?.subscription?.cancelAtPeriodEnd === true;

  const scheduleNotice = useMemo(() => {
    if (!billingState) {
      return null;
    }

    if (polarProducts) {
      const pendingId = effectiveLiveSubscriptionSchedule?.pendingProductId;
      const pendingTier = tierForConfiguredProductId(pendingId, polarProducts);
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
    polarProducts,
    billingState,
    effectiveLiveSubscriptionSchedule,
    currentTier,
    cancelAtPeriodEndMerged,
    rank,
    renewSummary,
  ]);

  const pendingProductIdLive = effectiveLiveSubscriptionSchedule?.pendingProductId;
  const pendingTierLive = tierForConfiguredProductId(
    pendingProductIdLive,
    polarProducts,
  );

  const showRescindCancellation =
    cancelAtPeriodEndMerged && rank >= 1 && Boolean(subscriptionId);

  const hasPendingPlanChange =
    rank >= 1 &&
    Boolean(subscriptionId) &&
    pendingProductIdLive != null &&
    pendingProductIdLive !== "" &&
    (polarProducts == null ||
      pendingTierLive === null ||
      pendingTierLive !== currentTier);

  const showBillingSchedulePanel =
    scheduleNotice !== null || showRescindCancellation || hasPendingPlanChange;

  const stayOnPlanButtonLabel =
    pendingTierLive === null || !polarProducts
      ? "Keep current plan at renewal"
      : `Stay on ${planTierLabel(currentTier)}`;

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
    const { productId } = planSwitchConfirm;
    const periodEndAtConfirm = billingState?.currentPeriodEnd;
    const cancelAtPeriodEndAtConfirm =
      baseBillingState?.subscription?.cancelAtPeriodEnd === true;

    setPlanSwitchLoading(true);
    setBillingError(null);
    try {
      const switchResult = await switchPaidPlan({ productId });
      setPlanSwitchConfirm(null);

      // Downgrades use `next_period`; Polar can return the subscription GET
      // one tick behind the update, so `pending_update` may be missing until
      // a later poll. Apply a schedule we already know is correct.
      if (switchResult.prorationBehavior === "next_period") {
        setLiveSubscriptionSchedule({
          cancelAtPeriodEnd: cancelAtPeriodEndAtConfirm,
          pendingProductId: productId,
          pendingAppliesAtMs: periodEndAtConfirm,
        });
      }

      const result = await refreshBillingStatus({});
      const refreshed = coerceSubscriptionSchedule(result.subscriptionSchedule);

      setLiveSubscriptionSchedule((prev) => {
        if (switchResult.prorationBehavior === "next_period") {
          if (
            typeof refreshed.pendingProductId === "string" &&
            refreshed.pendingProductId !== ""
          ) {
            return refreshed;
          }
          return {
            cancelAtPeriodEnd: refreshed.cancelAtPeriodEnd,
            pendingProductId: productId,
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Billing</h1>
        <div className="flex items-center gap-2">
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
                  Your new plan starts right away. You&apos;ll be charged a
                  prorated amount for the rest of this billing period, then your
                  usual renewal price.
                </>
              ) : (
                <>
                  You will be downgraded to {planSwitchConfirm?.planName} at the
                  end of this billing cycle.
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

      <CreditBalancePanel
        bucketBalances={billingState?.bucketBalances}
        expiringSoon={billingState?.expiringSoon}
        includedMonthlyCredits={includedMonthlyCredits}
        currentPeriodStart={billingState?.currentPeriodStart}
        currentPeriodEnd={billingState?.currentPeriodEnd}
      />

      <section id="plans" className="scroll-mt-6 space-y-3">
        <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
          Plans
        </p>
        {showBillingSchedulePanel ? (
          <Card className="gap-0 bg-primary/4 px-5 py-3 text-sm leading-relaxed ring-primary/30">
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
            polarApi={polarApi}
            checkoutAnchorClass={checkoutAnchorClass}
            subscriptionId={subscriptionId ?? undefined}
            buttonLabel="Free"
            renewalSummary={renewSummary}
          />
          <TierColumn
            name="Plus"
            plan={getPlanConfig("plus", billingConfig)}
            priceLabel={formatPolarRecurringPrice(plusProduct ?? undefined)}
            state={
              rank === 1 ? "current" : rank === 0 ? "available" : "available"
            }
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
          : `Downgrade to ${buttonLabel ?? name}`}
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
            : buttonVariants({
                variant: "outline",
                size: "sm",
                className: "bg-transparent",
              }),
          "mt-auto",
        )}
      >
        Subscribe to {buttonLabel ?? name}
      </CheckoutLink>
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
        "bg-muted/35 flex min-h-[192px] flex-col gap-0 px-5 py-5 shadow-none ring-border",
        emphasize && state === "available"
          ? "bg-primary/3 ring-1 ring-primary/40"
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
        <li>{plan.markupMultiplier}× markup vs raw usage</li>
        <li>Overdraft {plan.overageAllowed ? "on" : "off"}</li>
      </ul>
      {footer}
    </Card>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function useNowMs(tickMs = 60_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, tickMs);

    return () => {
      clearInterval(timer);
    };
  }, [tickMs]);

  return nowMs;
}

/**
 * Credit Balance card — stacked-row layout that lists every bucket plus
 * a period-summary block (big total, usage progress, period dates, plan
 * stats). The currently-draining bucket (the lowest-priority bucket with
 * credits remaining) is highlighted to mirror allocation order:
 * gifted → monthly → paid.
 */
function CreditBalancePanel({
  bucketBalances,
  expiringSoon,
  includedMonthlyCredits,
  currentPeriodStart,
  currentPeriodEnd,
}: {
  bucketBalances: Record<CreditBucket, number> | undefined;
  expiringSoon:
    | {
        bucket: CreditBucket;
        grantId: string;
        remaining: number;
        expiresAt: number;
      }[]
    | undefined;
  includedMonthlyCredits: number | undefined;
  currentPeriodStart: number | undefined;
  currentPeriodEnd: number | undefined;
}) {
  const nowMs = useNowMs();
  const orderedBuckets = useMemo<CreditBucket[]>(
    () =>
      (Object.keys(CREDIT_BUCKETS) as CreditBucket[]).sort(
        (a, b) => CREDIT_BUCKETS[a].priority - CREDIT_BUCKETS[b].priority,
      ),
    [],
  );

  const balances: Record<CreditBucket, number> = bucketBalances ?? {
    gifted: 0,
    monthly: 0,
    paid: 0,
  };
  const total = orderedBuckets.reduce((sum, b) => sum + balances[b], 0);

  // The bucket that drains next is the lowest-priority bucket (gifted first)
  // that still has remaining credits. Highlighting it mirrors what the
  // backend allocator will actually consume on the next debit.
  const activeBucket: CreditBucket | undefined = orderedBuckets.find(
    (b) => balances[b] > 0,
  );

  // The bucket tied to the user's plan period — what "this period" means.
  // Free and paid tiers both use the unified `monthly` recurring allowance.
  const periodBucket: CreditBucket = "monthly";
  const periodRemaining = balances[periodBucket];
  const periodMax = includedMonthlyCredits;

  // "Used this period" = max - remaining (clamped). When max is unknown
  // (e.g. data still loading) we leave the secondary copy blank.
  const periodUsed =
    periodMax !== undefined
      ? Math.max(0, periodMax - periodRemaining)
      : undefined;
  const periodUsedPct =
    periodMax !== undefined && periodMax > 0 && periodUsed !== undefined
      ? Math.min(100, Math.round((periodUsed / periodMax) * 100))
      : undefined;

  // Maxes for the current period: only the bucket tied to the user's tier
  // has a known "out of N" denominator. Others just show remaining.
  const periodMaxByBucket: Partial<Record<CreditBucket, number>> = {};
  if (periodMax !== undefined) {
    periodMaxByBucket[periodBucket] = periodMax;
  }

  const daysUntilReset =
    currentPeriodEnd != null
      ? Math.max(0, Math.ceil((currentPeriodEnd - nowMs) / 86_400_000))
      : undefined;

  const periodEndDateLabel =
    currentPeriodEnd != null
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
          currentPeriodEnd,
        )
      : null;
  const periodStartDateLabel =
    currentPeriodStart != null
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
          currentPeriodStart,
        )
      : null;

  return (
    <section className="space-y-3">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        Credit balance
      </p>
      <Card className="gap-0 overflow-hidden bg-muted/35 p-0 py-0 shadow-none ring-border">
        {/* Period summary: big totals + usage progress + plan info */}
        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Total available"
              value={formatNumber(total)}
              hint={
                total === 0
                  ? "Credits left to spend"
                  : `Across ${
                      orderedBuckets.filter((b) => balances[b] > 0)
                        .length
                    } bucket${
                      orderedBuckets.filter((b) => balances[b] > 0)
                        .length === 1
                        ? ""
                        : "s"
                    }`
              }
            />
            <Stat
              label="Used this period"
              value={periodUsed !== undefined ? formatNumber(periodUsed) : "—"}
              hint={
                periodMax !== undefined
                  ? `of ${formatNumber(periodMax)} included`
                  : "Usage details loading"
              }
            />
            <Stat
              label="Resets"
              value={daysUntilReset !== undefined ? `${daysUntilReset}d` : "—"}
              hint={periodEndDateLabel ?? "Renewal date loading"}
            />
          </div>

          {periodUsedPct !== undefined ? (
            <Progress
              value={periodUsedPct}
              aria-label={`${CREDIT_BUCKETS[periodBucket].label} credits used this period`}
              className="flex-col gap-2 [&_[data-slot=progress-track]]:h-1.5"
            >
              <div className="flex w-full items-baseline justify-between gap-3">
                <ProgressLabel className="text-muted-foreground text-xs font-normal">
                  {CREDIT_BUCKETS[periodBucket].label} credits ·{" "}
                  {periodStartDateLabel
                    ? `${periodStartDateLabel} →`
                    : "this period"}{" "}
                  {periodEndDateLabel ?? ""}
                </ProgressLabel>
                <ProgressValue
                  className="text-foreground shrink-0 text-xs font-medium tabular-nums"
                  render={
                    <span>{`${formatNumber(periodRemaining)} / ${formatNumber(
                      periodMax ?? 0,
                    )}`}</span>
                  }
                />
              </div>
            </Progress>
          ) : null}
        </div>

        <Separator />

        <ul className="px-3 py-3">
          {orderedBuckets.map((bucket) => {
            const remaining = balances[bucket];
            const max = periodMaxByBucket[bucket];
            return (
              <CreditBucketRow
                key={bucket}
                label={`${CREDIT_BUCKETS[bucket].label} Credits`}
                tooltip={creditBucketTooltip(bucket)}
                remaining={remaining}
                max={max}
                active={bucket === activeBucket}
              />
            );
          })}
          <CreditBucketRow
            label="Total Available Credits"
            remaining={total}
            emphasized
          />
        </ul>

        {expiringSoon && expiringSoon.length > 0 ? (
          <>
            <Separator />
            <p className="text-muted-foreground px-5 py-3 text-xs">
            <Info
              className="mr-1.5 inline-block size-3.5 align-[-2px]"
              aria-hidden
            />
            {expiringSoon
              .slice(0, 3)
              .map(
                (g) =>
                  `${formatNumber(g.remaining)} ${CREDIT_BUCKETS[g.bucket].label.toLowerCase()} credits expire ${new Intl.DateTimeFormat(
                    "en-US",
                    { dateStyle: "medium" },
                  ).format(g.expiresAt)}`,
              )
              .join(" · ")}
            </p>
          </>
        ) : null}
      </Card>
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-foreground font-mono text-2xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground text-[11px]">{hint}</p>
      ) : null}
    </div>
  );
}

function CreditBucketRow({
  label,
  tooltip,
  remaining,
  max,
  active,
  emphasized,
}: {
  label: string;
  tooltip?: string;
  remaining: number;
  max?: number;
  active?: boolean;
  emphasized?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between rounded-md px-3 py-2.5 text-sm",
        active && "bg-primary/10 ring-primary/20 ring-1",
        emphasized && "mt-1 font-semibold",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn(emphasized ? "text-foreground" : "text-foreground")}
        >
          {label}
        </span>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`${label} info`}
                  className="text-muted-foreground hover:text-foreground inline-flex size-4 items-center justify-center rounded-full transition-colors"
                />
              }
            >
              <Info className="size-3" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <span className="text-foreground tabular-nums">
        {max !== undefined
          ? `${formatNumber(remaining)} / ${formatNumber(max)}`
          : formatNumber(remaining)}
      </span>
    </li>
  );
}

function creditBucketTooltip(bucket: CreditBucket): string {
  switch (bucket) {
    case "gifted":
      return "Promotional credits granted to your account. Spent first.";
    case "monthly":
      return "Recurring plan allowance (free, plus, or pro). Resets each plan period and expires at period end.";
    case "paid":
      return "Credits you purchased as a one-time top-up. Spent last; long-lived.";
  }
}
