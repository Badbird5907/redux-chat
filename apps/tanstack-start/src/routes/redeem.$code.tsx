import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gift,
} from "lucide-react";
import { toast } from "sonner";

import type { SubscriptionPromotionConfig } from "@redux/shared";
import { api } from "@redux/backend/convex/_generated/api";
import {
  DEFAULT_BILLING_CONFIG,
  discountedPriceCentsFromList,
  getPlanConfig,
} from "@redux/shared";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";

import { formatDate } from "@/components/admin/user-detail/utils";
import {
  formatCurrencyFromMinorUnits,
  PlanTierMarketingCard,
} from "@/components/billing/plan-tier-marketing-card";

export const Route = createFileRoute("/redeem/$code")({
  beforeLoad: ({ context }) => {
    if (!context.isAuthenticated) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: "/auth/sign-in",
      });
    }
  },
  head: ({ params }) => ({
    meta: [{ title: `Redeem ${params.code} | Redux Chat` }],
  }),
  component: RedeemPromotionPage,
});

const billingConfig = DEFAULT_BILLING_CONFIG;

type StripeConfiguredPrices = {
  plus: { id: string; amount: number | null; currency: string | null };
  pro: { id: string; amount: number | null; currency: string | null };
};

type PaidPlanSwitchPreview = {
  prorationDate: number;
  currency: string;
  amountDue: number;
  startingBalance: number;
  prorationCredit: number;
  prorationCharge: number;
  otherInvoiceAmount: number;
};

function tierRank(tier: string | undefined): number {
  if (tier === "free") return 0;
  if (tier === "plus") return 1;
  if (tier === "pro") return 2;
  return -1;
}

function planTierLabel(tier: string | undefined): string {
  if (tier === "plus") return "Plus";
  if (tier === "pro") return "Pro";
  return "Free";
}

function redeemPlanPriceLabels(
  product: StripeConfiguredPrices["plus"] | undefined,
  discount: SubscriptionPromotionConfig["discount"] | undefined,
): { priceLabel?: string; compareAtPriceLabel?: string } {
  if (product?.amount == null || typeof product.amount !== "number") {
    return {};
  }
  const currency = (product.currency ?? "USD").toUpperCase();
  const listCents = product.amount;
  const listFormatted = formatCurrencyFromMinorUnits(listCents, currency);
  if (!discount) {
    return { priceLabel: listFormatted };
  }
  const discountedCents = discountedPriceCentsFromList(listCents, discount);
  if (discountedCents >= listCents) {
    return { priceLabel: listFormatted };
  }
  const discountedFormatted = formatCurrencyFromMinorUnits(
    discountedCents,
    currency,
  );
  return {
    compareAtPriceLabel: listFormatted,
    priceLabel: discountedFormatted,
  };
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

function RedeemPromotionPage() {
  const { code } = Route.useParams();
  const promotion = useQuery(api.functions.promotions.getPromotionByCode, {
    code,
  });
  const billingState = useQuery(
    api.functions.billing.getCurrentBillingState,
    {},
  );
  const getStripePriceDetails = useAction(
    api.functions.billing.getConfiguredStripePriceDetails,
  );
  const previewSubscriptionPromotionUpgrade = useAction(
    api.functions.promotions.previewSubscriptionPromotionUpgrade,
  );
  const [configuredStripePrices, setConfiguredStripePrices] =
    useState<StripeConfiguredPrices | null>(null);
  const redeemPromotion = useAction(api.functions.promotions.redeemPromotion);
  const cancelPendingCheckout = useAction(
    api.functions.promotions.cancelPendingPromotionCheckout,
  );
  const [targetTier, setTargetTier] = useState<"plus" | "pro" | undefined>();
  const [result, setResult] = useState<{
    type?: string;
    kind?: string;
    amount: number;
    amountCents?: number;
    currency?: string;
    expiresAt?: number;
    freeUntil?: number;
    targetTier?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [upgradePreview, setUpgradePreview] = useState<{
    targetTier: "plus" | "pro";
    loading: boolean;
    data: PaidPlanSwitchPreview | null;
    error: string | null;
  } | null>(null);

  const redeem = async () => {
    setPending(true);
    setError(null);
    try {
      const redeemed = await redeemPromotion({
        code,
        targetTier,
        prorationDate:
          upgradePreview?.targetTier === targetTier
            ? (upgradePreview?.data?.prorationDate ?? undefined)
            : undefined,
      });
      if (redeemed.type === "checkout_redirect") {
        window.location.assign(redeemed.url);
        return;
      }
      setResult({
        type:
          "type" in redeemed && typeof redeemed.type === "string"
            ? redeemed.type
            : undefined,
        kind:
          "kind" in redeemed && typeof redeemed.kind === "string"
            ? redeemed.kind
            : undefined,
        amount:
          "amount" in redeemed && typeof redeemed.amount === "number"
            ? redeemed.amount
            : 0,
        amountCents:
          "amountCents" in redeemed && typeof redeemed.amountCents === "number"
            ? redeemed.amountCents
            : undefined,
        currency:
          "currency" in redeemed && typeof redeemed.currency === "string"
            ? redeemed.currency
            : undefined,
        expiresAt:
          "expiresAt" in redeemed && typeof redeemed.expiresAt === "number"
            ? redeemed.expiresAt
            : undefined,
        freeUntil:
          "freeUntil" in redeemed && typeof redeemed.freeUntil === "number"
            ? redeemed.freeUntil
            : undefined,
        targetTier:
          "targetTier" in redeemed && typeof redeemed.targetTier === "string"
            ? redeemed.targetTier
            : undefined,
      });
      toast.success("Promotion redeemed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not redeem code.");
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    const redemptionId = params.get("redemptionId");
    if (checkout === "cancelled" && redemptionId) {
      void cancelPendingCheckout({ redemptionId }).catch(() => {
        // The server keeps checkout cleanup idempotent; surfacing this adds
        // noise after a user intentionally canceled.
      });
      const timeout = window.setTimeout(
        () => setError("Checkout was cancelled."),
        0,
      );
      return () => window.clearTimeout(timeout);
    }
    if (checkout === "success") {
      const timeout = window.setTimeout(
        () =>
          setCheckoutMessage(
            "Checkout completed. Your promotion is being applied.",
          ),
        0,
      );
      return () => window.clearTimeout(timeout);
    }
  }, [cancelPendingCheckout]);

  useEffect(() => {
    let cancelled = false;
    void getStripePriceDetails({})
      .then((prices) => {
        if (!cancelled) {
          setConfiguredStripePrices(prices);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setConfiguredStripePrices(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [getStripePriceDetails]);

  const isSubscriptionPromo = promotion?.kind === "subscription_discount";
  const configuredTargetTiers = isSubscriptionPromo
    ? promotion.redeemableTargetTiers
    : [];
  const selectedTargetTier =
    targetTier ??
    (configuredTargetTiers.length === 1 ? configuredTargetTiers[0] : undefined);
  const currentTier = billingState?.tier ?? "free";
  const currentTierRank = tierRank(currentTier);
  const selectedTargetRank = tierRank(selectedTargetTier);
  const paidUpgradeSelected =
    isSubscriptionPromo &&
    currentTierRank > 0 &&
    selectedTargetTier !== undefined &&
    selectedTargetRank > currentTierRank;
  const activeUpgradePreview =
    upgradePreview?.targetTier === selectedTargetTier ? upgradePreview : null;

  useEffect(() => {
    if (!paidUpgradeSelected) {
      return;
    }

    let cancelled = false;
    void previewSubscriptionPromotionUpgrade({
      code,
      targetTier: selectedTargetTier,
    })
      .then((preview) => {
        if (!cancelled) {
          setUpgradePreview({
            targetTier: selectedTargetTier,
            loading: false,
            data: preview,
            error: null,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setUpgradePreview({
            targetTier: selectedTargetTier,
            loading: false,
            data: null,
            error:
              err instanceof Error
                ? err.message
                : "Could not load the Stripe invoice preview.",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    code,
    paidUpgradeSelected,
    previewSubscriptionPromotionUpgrade,
    selectedTargetTier,
  ]);

  const selectSubscriptionTargetTier = (tier: "plus" | "pro") => {
    setTargetTier(tier);
    setUpgradePreview(null);
  };

  if (promotion === undefined) {
    return (
      <RedeemShell>
        <section className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="bg-muted h-2" />
          <div className="space-y-5 p-6">
            <div className="bg-muted h-12 w-12 rounded-lg" />
            <div className="space-y-2">
              <div className="bg-muted h-7 w-2/3 rounded" />
              <div className="bg-muted h-4 w-1/2 rounded" />
            </div>
            <div className="bg-muted h-24 rounded-lg" />
          </div>
        </section>
      </RedeemShell>
    );
  }

  if (promotion === null) {
    return (
      <RedeemShell>
        <StatusPanel
          icon={<AlertCircle className="size-6" />}
          tone="destructive"
          title="Promotion not found"
          description="This code does not match an active promotion. Check the link and try again."
        />
      </RedeemShell>
    );
  }

  const requiresTierSelection =
    isSubscriptionPromo && promotion.requiresTargetTierSelection;
  const selectedTierLabel =
    selectedTargetTier === "pro"
      ? "Pro"
      : selectedTargetTier === "plus"
        ? "Plus"
        : undefined;
  const selectedTargetIsNotUpgrade =
    isSubscriptionPromo &&
    currentTierRank > 0 &&
    selectedTargetTier !== undefined &&
    selectedTargetRank <= currentTierRank;
  const subscriptionBillingLoading =
    isSubscriptionPromo && billingState === undefined;
  const actionDisabled =
    result !== null ||
    promotion.canRedeem === false ||
    pending ||
    subscriptionBillingLoading ||
    (requiresTierSelection && targetTier === undefined) ||
    selectedTargetIsNotUpgrade ||
    (paidUpgradeSelected &&
      (!activeUpgradePreview?.data || activeUpgradePreview.error !== null));
  const actionLabel = pending
    ? "Redeeming..."
    : promotion.ineligibleReason === "You already redeemed this promotion."
      ? "Already Redeemed"
      : promotion.canRedeem === false
        ? "Unavailable"
        : subscriptionBillingLoading
          ? "Loading billing..."
          : selectedTargetIsNotUpgrade
            ? "Upgrade required"
            : isSubscriptionPromo && promotion.requiresCheckout
              ? "Continue to checkout"
              : "Redeem promotion";

  const promotionDiscount =
    promotion.kind === "subscription_discount" &&
    "subscriptionDiscount" in promotion &&
    promotion.subscriptionDiscount != null
      ? promotion.subscriptionDiscount.discount
      : undefined;

  return (
    <RedeemShell>
      <section className="border-border bg-card overflow-hidden rounded-xl border shadow-sm">
        <div className="bg-primary h-2" />
        <div className="p-6 sm:p-7">
          <div className="flex min-w-0 items-start gap-3">
            <div className="bg-primary/10 text-primary rounded-lg p-2.5">
              <Gift className="size-5" />
            </div>
            <div className="min-w-0">
              <Badge variant="secondary" className="mb-2 font-mono">
                {promotion.code}
              </Badge>
              <h1 className="text-foreground text-2xl font-semibold tracking-tight">
                {promotion.name}
              </h1>
              {promotion.description ? (
                <p className="text-muted-foreground mt-2 text-sm leading-6">
                  {promotion.description}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm font-medium">Promotion benefit</p>
            <p className="text-muted-foreground mt-1 text-base leading-7">
              {promotion.configSummary}
            </p>
          </div>

          {requiresTierSelection ? (
            <div className="mt-6 grid gap-3">
              <p className="text-sm font-medium">Choose your plan</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {promotion.redeemableTargetTiers.includes("plus") ? (
                  <PlanTierMarketingCard
                    name="Plus"
                    plan={getPlanConfig("plus", billingConfig)}
                    {...redeemPlanPriceLabels(
                      configuredStripePrices?.plus,
                      promotionDiscount,
                    )}
                    renewalLine={undefined}
                    state={
                      currentTierRank > 0 && tierRank("plus") <= currentTierRank
                        ? "inactive"
                        : "available"
                    }
                    emphasize={false}
                    selected={targetTier === "plus"}
                    onSelect={() => {
                      selectSubscriptionTargetTier("plus");
                    }}
                    footer={
                      <p className="text-muted-foreground text-center text-xs">
                        {currentTierRank > 0 &&
                        tierRank("plus") <= currentTierRank
                          ? currentTier === "plus"
                            ? "Already on Plus"
                            : "On a higher plan"
                          : targetTier === "plus"
                            ? "Selected for checkout"
                            : "Apply promotion to Plus"}
                      </p>
                    }
                  />
                ) : null}
                {promotion.redeemableTargetTiers.includes("pro") ? (
                  <PlanTierMarketingCard
                    name="Pro"
                    plan={getPlanConfig("pro", billingConfig)}
                    {...redeemPlanPriceLabels(
                      configuredStripePrices?.pro,
                      promotionDiscount,
                    )}
                    renewalLine={undefined}
                    state={
                      currentTierRank > 0 && tierRank("pro") <= currentTierRank
                        ? "inactive"
                        : "available"
                    }
                    emphasize={false}
                    selected={targetTier === "pro"}
                    onSelect={() => {
                      selectSubscriptionTargetTier("pro");
                    }}
                    footer={
                      <p className="text-muted-foreground text-center text-xs">
                        {currentTierRank > 0 &&
                        tierRank("pro") <= currentTierRank
                          ? currentTier === "pro"
                            ? "Already on Pro"
                            : "On a higher plan"
                          : targetTier === "pro"
                            ? "Selected for checkout"
                            : "Apply promotion to Pro"}
                      </p>
                    }
                  />
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs">
                Pick the plan you want this promotion applied to. Subscription
                promotions can only upgrade your current plan.
              </p>
            </div>
          ) : null}

          {paidUpgradeSelected ? (
            <div className="ring-border bg-muted/25 mt-6 space-y-4 rounded-lg p-4 ring-1">
              {activeUpgradePreview?.error ? (
                <p className="text-destructive text-sm">
                  {activeUpgradePreview.error}
                </p>
              ) : activeUpgradePreview?.data ? (
                <>
                  <div className="space-y-3 text-sm">
                    {activeUpgradePreview.data.prorationCredit > 0 ? (
                      <div className="flex items-start justify-between gap-4">
                        <span>Unused {planTierLabel(currentTier)} credit</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatSignedCurrencyFromMinorUnits(
                            -activeUpgradePreview.data.prorationCredit,
                            activeUpgradePreview.data.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                    {activeUpgradePreview.data.prorationCharge > 0 ? (
                      <div className="flex items-start justify-between gap-4">
                        <span>{selectedTierLabel} prorated charge</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatCurrencyFromMinorUnits(
                            activeUpgradePreview.data.prorationCharge,
                            activeUpgradePreview.data.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                    {activeUpgradePreview.data.otherInvoiceAmount !== 0 ? (
                      <div className="flex items-start justify-between gap-4">
                        <span>Promotion, taxes, or invoice adjustments</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatSignedCurrencyFromMinorUnits(
                            activeUpgradePreview.data.otherInvoiceAmount,
                            activeUpgradePreview.data.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                    {activeUpgradePreview.data.startingBalance < 0 ? (
                      <div className="flex items-start justify-between gap-4">
                        <span>Invoice credits applied</span>
                        <span className="font-mono font-semibold tabular-nums">
                          {formatSignedCurrencyFromMinorUnits(
                            activeUpgradePreview.data.startingBalance,
                            activeUpgradePreview.data.currency,
                          )}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="border-border flex items-center justify-between gap-4 border-t pt-4 text-base font-semibold">
                    <span>Due today</span>
                    <span className="font-mono tabular-nums">
                      {formatCurrencyFromMinorUnits(
                        activeUpgradePreview.data.amountDue,
                        activeUpgradePreview.data.currency,
                      )}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Preparing Stripe invoice preview...
                </p>
              )}
            </div>
          ) : null}

          {checkoutMessage ? (
            <StatusPanel
              icon={<Clock3 className="size-5" />}
              tone="muted"
              title="Checkout complete"
              description={checkoutMessage}
              className="mt-6"
            />
          ) : null}

          {result ? (
            <StatusPanel
              icon={<CheckCircle2 className="size-5" />}
              tone="success"
              title="Promotion redeemed"
              description={formatRedemptionResult(result)}
              className="mt-6"
            />
          ) : null}

          {error ? (
            <StatusPanel
              icon={<AlertCircle className="size-5" />}
              tone="destructive"
              title="Could not redeem"
              description={error}
              className="mt-6"
            />
          ) : null}

          {!result ? (
            <Button
              type="button"
              className="mt-6 h-11 w-full"
              disabled={actionDisabled}
              onClick={() => void redeem()}
            >
              {actionLabel}
              {!pending ? <ArrowRight className="size-4" /> : null}
            </Button>
          ) : null}

          {selectedTargetIsNotUpgrade && !result ? (
            <p className="text-muted-foreground mt-3 text-center text-xs">
              This promotion cannot be applied to your current plan.
            </p>
          ) : requiresTierSelection && targetTier === undefined && !result ? (
            <p className="text-muted-foreground mt-3 text-center text-xs">
              Choose a plan before redeeming.
            </p>
          ) : selectedTierLabel && !result ? (
            <p className="text-muted-foreground mt-3 text-center text-xs">
              This promotion will be applied to {selectedTierLabel}.
            </p>
          ) : null}
        </div>
      </section>
    </RedeemShell>
  );
}

function RedeemShell({ children }: { children: ReactNode }) {
  return (
    <main className="bg-background min-h-screen">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full min-w-0">{children}</div>
      </div>
    </main>
  );
}

function StatusPanel({
  icon,
  tone,
  title,
  description,
  className,
}: {
  icon: ReactNode;
  tone: "success" | "destructive" | "muted";
  title: string;
  description: string;
  className?: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : tone === "destructive"
        ? "border-destructive/30 bg-destructive/10 text-destructive"
        : "border-border bg-muted/35 text-foreground";

  return (
    <div
      className={`rounded-lg border p-4 text-sm ${toneClass} ${className ?? ""}`}
    >
      <div className="flex items-center gap-2 font-medium">
        {icon}
        {title}
      </div>
      <p className="text-muted-foreground mt-2 leading-6">{description}</p>
    </div>
  );
}

function formatRedemptionResult(result: {
  kind?: string;
  amount: number;
  amountCents?: number;
  currency?: string;
  expiresAt?: number;
  freeUntil?: number;
  targetTier?: string;
}) {
  const base =
    result.kind === "stripe_invoice_credit" && result.amountCents !== undefined
      ? `${formatCurrencyFromMinorUnits(
          result.amountCents,
          result.currency ?? "USD",
        )} was added to your Stripe invoice balance.`
      : result.kind === "subscription_discount"
        ? `${result.targetTier ?? "Subscription"} promotion applied.${
            result.freeUntil
              ? ` Free until ${formatDate(result.freeUntil)}.`
              : ""
          }`
        : `${result.amount.toLocaleString()} gifted credits were added to your account.`;

  return `${base}${
    result.kind !== "stripe_invoice_credit" && result.expiresAt
      ? ` Expires ${formatDate(result.expiresAt)}.`
      : ""
  }`;
}
