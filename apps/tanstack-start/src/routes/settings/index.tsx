import type { StripePlanPrice } from "@/components/billing/plan-tier-marketing-utils";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAction } from "convex/react";
import { ChevronRight, CreditCard, TriangleAlert } from "lucide-react";

import type { PlanTier } from "@redux/shared";
import { api } from "@redux/backend/convex/_generated/api";
import {
  DEFAULT_BILLING_CONFIG,
  getPlanConfig,
  getPlanTierRank,
  planTierLabel,
} from "@redux/shared";
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
import { BillingSimulationPanel } from "@/components/billing/billing-simulation-panel";
import { CreditBalancePanel } from "@/components/billing/credit-balance-panel";
import { CreditGrantHistoryDialog } from "@/components/billing/credit-grant-history";
import { PlanTierMarketingCard } from "@/components/billing/plan-tier-marketing-card";
import { formatStripeRecurringPrice } from "@/components/billing/plan-tier-marketing-utils";
import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import { useQuery } from "@/lib/hooks/convex";
import { useReducerState } from "@/lib/hooks/use-reducer-state";

type SettingsSearch = {
  checkout?: "success" | "cancelled";
  session_id?: string;
  billingPortal?: "return";
};

type PendingStripeBillingCallback =
  | { kind: "checkout"; sessionId?: string }
  | { kind: "portal" };

const PENDING_STRIPE_BILLING_CALLBACK_KEY =
  "redux-chat:pending-stripe-billing-callback";
const LEGACY_CHECKOUT_SESSION_ID = "";

function isPendingStripeBillingCallback(
  value: unknown,
): value is PendingStripeBillingCallback {
  if (!value || typeof value !== "object") return false;
  const callback = value as Record<string, unknown>;
  if (callback.kind === "portal") return true;
  return (
    callback.kind === "checkout" &&
    (callback.sessionId === undefined || typeof callback.sessionId === "string")
  );
}

function readPendingStripeBillingCallback(): PendingStripeBillingCallback | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(
      PENDING_STRIPE_BILLING_CALLBACK_KEY,
    );
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isPendingStripeBillingCallback(parsed)) return parsed;
    window.sessionStorage.removeItem(PENDING_STRIPE_BILLING_CALLBACK_KEY);
  } catch {
    try {
      window.sessionStorage.removeItem(PENDING_STRIPE_BILLING_CALLBACK_KEY);
    } catch {
      // Session storage is unavailable; the callback URL remains the fallback.
    }
  }
  return null;
}

function persistPendingStripeBillingCallback(
  callback: PendingStripeBillingCallback,
): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.sessionStorage.setItem(
      PENDING_STRIPE_BILLING_CALLBACK_KEY,
      JSON.stringify(callback),
    );
    return true;
  } catch {
    return false;
  }
}

function clearPendingStripeBillingCallback(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PENDING_STRIPE_BILLING_CALLBACK_KEY);
  } catch {
    // Reconciliation remains recoverable through the callback URL.
  }
}

export const Route = createFileRoute("/settings/")({
  validateSearch: (search): SettingsSearch => ({
    checkout:
      search.checkout === "success" || search.checkout === "cancelled"
        ? search.checkout
        : undefined,
    session_id:
      typeof search.session_id === "string" ? search.session_id : undefined,
    billingPortal: search.billingPortal === "return" ? "return" : undefined,
  }),
  component: RouteComponent,
});

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const renewalDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

function getCurrencyFormatter(currency: string) {
  const normalizedCurrency = currency.toUpperCase();
  const cachedFormatter = currencyFormatters.get(normalizedCurrency);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizedCurrency,
  });
  currencyFormatters.set(normalizedCurrency, formatter);
  return formatter;
}

const billingConfig = DEFAULT_BILLING_CONFIG;

type StripePriceConfig = {
  base: NonNullable<StripePlanPrice>;
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

function tierForConfiguredPriceId(
  priceId: string | undefined,
  products:
    | {
        base?: { id: string } | null;
        plus?: { id: string } | null;
        pro?: { id: string } | null;
      }
    | null
    | undefined,
): PlanTier | null {
  if (!priceId || !products) {
    return null;
  }
  if (products.base?.id === priceId) {
    return "base";
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
    return getCurrencyFormatter(currency).format(amount / 100);
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
  const dateStr = renewalDateFormatter.format(periodEnd);
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
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
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
  const reconcileStripeSubscriptions = useAction(
    api.functions.billing.reconcileCurrentUserStripeSubscriptions,
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
  const [billingError, setBillingError] = useReducerState<string | null>(null);
  const [planSwitchConfirm, setPlanSwitchConfirm] = useReducerState<{
    priceId: string;
    planName: string;
    isUpgrade: boolean;
  } | null>(null);
  const [checkoutLoadingPriceId, setCheckoutLoadingPriceId] = useReducerState<
    string | null
  >(null);
  const [portalLoading, setPortalLoading] = useReducerState(false);
  const [stripePriceDetails, setStripePriceDetails] =
    useReducerState<StripePriceConfig | null>(null);
  const [stripeCustomerBalance, setStripeCustomerBalance] =
    useReducerState<StripeCustomerBalanceSummary | null>(null);
  const [planSwitchLoading, setPlanSwitchLoading] = useReducerState(false);
  const [planSwitchPreview, setPlanSwitchPreview] = useReducerState<{
    priceId: string;
    loading: boolean;
    data: PaidPlanSwitchPreview | null;
    error: string | null;
  } | null>(null);
  const [liveSubscriptionSchedule, setLiveSubscriptionSchedule] =
    useReducerState<
      | {
          cancelAtPeriodEnd: boolean;
          pendingPriceId: string | undefined;
          pendingAppliesAtMs: number | undefined;
        }
      | undefined
    >(undefined);
  const [billingScheduleMutation, setBillingScheduleMutation] = useReducerState<
    "rescind" | "discard" | null
  >(null);
  const [addCreditsOpen, setAddCreditsOpen] = useReducerState(false);
  const [hasPaymentMethod, setHasPaymentMethod] = useReducerState<
    boolean | null
  >(null);
  const [stripeSyncState, setStripeSyncState] = useReducerState<{
    status: "idle" | "loading" | "error";
    callback?: PendingStripeBillingCallback;
    error?: string;
  }>({ status: "idle" });

  const hydratedScheduleForSubIdRef = useRef<string | null>(null);
  const cleanupRefreshStartedRef = useRef(false);
  const callbackProcessedRef = useRef(false);
  const billingQuerySettled = baseBillingState !== undefined;
  const subscriptionIdForHydration =
    baseBillingState?.subscription?.subscriptionId;
  const billingSimulationCleanupRequired =
    baseBillingState?.billingSimulation.cleanupRequired === true;

  const clearBillingCallbackSearch = useCallback(async () => {
    await navigate({
      search: (previous) => ({
        ...previous,
        checkout: undefined,
        session_id: undefined,
        billingPortal: undefined,
      }),
      replace: true,
    });
  }, [navigate]);

  const runStripeReconciliation = useCallback(
    async (callback: PendingStripeBillingCallback) => {
      setStripeSyncState({ status: "loading", callback });
      try {
        await reconcileStripeSubscriptions({
          checkoutSessionId:
            callback.kind === "checkout"
              ? (callback.sessionId ?? LEGACY_CHECKOUT_SESSION_ID)
              : undefined,
        });
      } catch (error) {
        setStripeSyncState({
          status: "error",
          callback,
          error:
            error instanceof Error
              ? error.message
              : "Could not synchronize your Stripe subscription.",
        });
        return;
      }

      clearPendingStripeBillingCallback();
      try {
        await clearBillingCallbackSearch();
      } catch {
        // The server reconciliation is idempotent if callback params remain.
      }
      setStripeSyncState({ status: "idle" });
    },
    [
      clearBillingCallbackSearch,
      reconcileStripeSubscriptions,
      setStripeSyncState,
    ],
  );

  useEffect(() => {
    if (callbackProcessedRef.current) return;

    if (search.checkout === "cancelled") {
      callbackProcessedRef.current = true;
      clearPendingStripeBillingCallback();
      void clearBillingCallbackSearch();
      return;
    }

    const urlCallback: PendingStripeBillingCallback | null =
      search.checkout === "success"
        ? { kind: "checkout", sessionId: search.session_id }
        : search.billingPortal === "return"
          ? { kind: "portal" }
          : null;
    const callback = urlCallback ?? readPendingStripeBillingCallback();
    if (!callback) return;
    callbackProcessedRef.current = true;

    if (urlCallback && persistPendingStripeBillingCallback(urlCallback)) {
      void clearBillingCallbackSearch();
    }
    void runStripeReconciliation(callback);
  }, [
    clearBillingCallbackSearch,
    runStripeReconciliation,
    search.billingPortal,
    search.checkout,
    search.session_id,
  ]);

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
    setLiveSubscriptionSchedule,
  ]);

  useEffect(() => {
    if (!billingSimulationCleanupRequired) {
      cleanupRefreshStartedRef.current = false;
      return;
    }
    if (
      !billingQuerySettled ||
      subscriptionIdForHydration ||
      cleanupRefreshStartedRef.current
    ) {
      return;
    }
    cleanupRefreshStartedRef.current = true;
    void refreshBillingStatus({}).catch((error: unknown) => {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Could not refresh preview billing state.",
      );
    });
  }, [
    billingQuerySettled,
    billingSimulationCleanupRequired,
    refreshBillingStatus,
    setBillingError,
    subscriptionIdForHydration,
  ]);

  const billingState = baseBillingState;
  const configuredStripePrices = stripePriceDetails ?? stripePrices;

  const includedMonthlyCredits =
    typeof billingState?.includedMonthlyCredits === "number"
      ? billingState.includedMonthlyCredits
      : undefined;
  const isSimulationActive = billingState?.billingMode === "simulation";

  useEffect(() => {
    if (isSimulationActive) {
      setAddCreditsOpen(false);
    }
  }, [isSimulationActive, setAddCreditsOpen]);

  const showStripeCustomerBalance =
    !isSimulationActive &&
    stripeCustomerBalance !== null &&
    stripeCustomerBalance.balanceCount > 0;

  const currentTier = billingState?.tier ?? "free";
  const basePrice = configuredStripePrices?.base ?? null;
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
  const showPaidManage =
    getPlanTierRank(currentTier) >= 1 && !isSimulationActive;
  const isOnPaidPlan = getPlanTierRank(currentTier) >= 1;
  const hasRealPaidSubscription =
    billingState?.billingMode === "actual" && isOnPaidPlan;
  const showMissingPaymentMethodNag =
    isOnPaidPlan && !isSimulationActive && hasPaymentMethod === false;

  const renewSummary = renewalSummary(billingState?.currentPeriodEnd);

  const rank = getPlanTierRank(currentTier);

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
    !isSimulationActive &&
    (scheduleNotice !== null ||
      showRescindCancellation ||
      hasPendingPlanChange);

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
  }, [getStripePriceDetails, setStripePriceDetails]);

  useEffect(() => {
    if (isSimulationActive) {
      setStripeCustomerBalance(null);
      return;
    }
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
  }, [getStripeCustomerBalance, isSimulationActive, setStripeCustomerBalance]);

  useEffect(() => {
    let cancelled = false;
    if (!isOnPaidPlan || isSimulationActive) {
      setHasPaymentMethod(null);
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
  }, [
    isOnPaidPlan,
    isSimulationActive,
    getPaymentMethodStatus,
    setHasPaymentMethod,
  ]);

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
  }, [planSwitchConfirm, previewPaidPlanSwitch, setPlanSwitchPreview]);

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

  const openCustomerPortal = async (pathSuffix = "") => {
    setPortalLoading(true);
    setBillingError(null);
    try {
      const portal = await createCustomerPortal({});
      const baseUrl = portal.url.replace(/\/+$/, "");
      window.location.href = pathSuffix
        ? `${baseUrl}${pathSuffix}`
        : portal.url;
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
          <MobileSidebarTrigger />
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

      <BillingSimulationPanel
        hasRealPaidSubscription={hasRealPaidSubscription}
      />

      {stripeSyncState.status === "loading" ? (
        <Card className="border-primary/25 bg-primary/6 ring-primary/15 gap-1 px-5 py-4 ring-1">
          <p className="text-sm font-semibold">Finalizing subscription…</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Synchronizing the latest Stripe subscription and monthly credits.
          </p>
        </Card>
      ) : stripeSyncState.status === "error" ? (
        <Card className="border-destructive/35 bg-destructive/10 gap-3 px-5 py-4">
          <div className="space-y-1">
            <p className="text-destructive text-sm font-semibold">
              Stripe subscription sync failed
            </p>
            <p className="text-destructive/90 text-xs leading-relaxed">
              {stripeSyncState.error}
            </p>
          </div>
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                stripeSyncState.callback
                  ? void runStripeReconciliation(stripeSyncState.callback)
                  : undefined
              }
              disabled={!stripeSyncState.callback}
            >
              Retry Stripe sync
            </Button>
          </div>
        </Card>
      ) : null}

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
                now so your plan can renew when your billing cycle renews.
              </p>
            </div>
            <div className="shrink-0">
              <Button
                type="button"
                variant="outline"
                className="whitespace-nowrap"
                disabled={portalLoading}
                onClick={() => void openCustomerPortal("/payment-methods")}
              >
                {portalLoading ? "Opening…" : "Add billing method"}
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
                  Preparing Stripe invoice preview&hellip;
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

      <AddCreditsDialog
        open={addCreditsOpen && !isSimulationActive}
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
                {isOnPaidPlan && !isSimulationActive ? (
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
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-4">
          <TierColumn
            name="Free"
            plan={getPlanConfig("free", billingConfig)}
            state={rank === 0 ? "current" : "inactive"}
            buttonLabel="Free"
            renewalSummary={renewSummary}
          />
          <TierColumn
            name="Base"
            plan={getPlanConfig("base", billingConfig)}
            priceLabel={formatStripeRecurringPrice(basePrice ?? undefined)}
            state={rank === 1 ? "current" : "available"}
            priceId={isSimulationActive ? undefined : basePrice?.id}
            buttonLabel="Base"
            emphasize={rank === 0}
            renewalSummary={renewSummary}
            checkoutLoading={checkoutLoadingPriceId === basePrice?.id}
            onSubscribe={
              !isSimulationActive && basePrice?.id
                ? () => void subscribeToPrice(basePrice.id)
                : undefined
            }
            paidSwitch={
              !isSimulationActive && isOnPaidPlan && rank > 1 && basePrice?.id
                ? {
                    isUpgrade: false,
                    onRequest: () =>
                      setPlanSwitchConfirm({
                        priceId: basePrice.id,
                        planName: "Base",
                        isUpgrade: false,
                      }),
                  }
                : undefined
            }
          />
          <TierColumn
            name="Plus"
            plan={getPlanConfig("plus", billingConfig)}
            priceLabel={formatStripeRecurringPrice(plusPrice ?? undefined)}
            state={rank === 2 ? "current" : "available"}
            priceId={isSimulationActive ? undefined : plusPrice?.id}
            buttonLabel="Plus"
            emphasize={rank === 1}
            renewalSummary={renewSummary}
            checkoutLoading={checkoutLoadingPriceId === plusPrice?.id}
            onSubscribe={
              !isSimulationActive && plusPrice?.id
                ? () => void subscribeToPrice(plusPrice.id)
                : undefined
            }
            paidSwitch={
              !isSimulationActive && isOnPaidPlan && rank !== 2 && plusPrice?.id
                ? {
                    isUpgrade: rank < 2,
                    onRequest: () =>
                      setPlanSwitchConfirm({
                        priceId: plusPrice.id,
                        planName: "Plus",
                        isUpgrade: rank < 2,
                      }),
                  }
                : undefined
            }
          />
          <TierColumn
            name="Pro"
            plan={getPlanConfig("pro", billingConfig)}
            priceLabel={formatStripeRecurringPrice(proPrice ?? undefined)}
            state={rank === 3 ? "current" : "available"}
            priceId={isSimulationActive ? undefined : proPrice?.id}
            buttonLabel="Pro"
            emphasize={rank === 2}
            renewalSummary={renewSummary}
            checkoutLoading={checkoutLoadingPriceId === proPrice?.id}
            onSubscribe={
              !isSimulationActive && proPrice?.id
                ? () => void subscribeToPrice(proPrice.id)
                : undefined
            }
            paidSwitch={
              !isSimulationActive && isOnPaidPlan && rank < 3 && proPrice?.id
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
