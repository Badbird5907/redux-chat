import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  Gift,
  Percent,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";

import { formatNumber } from "@/components/billing/credit-balance-panel";
import {
  formatCurrencyFromMinorUnits,
  getPolarRecurringPrice,
} from "@/components/billing/polar-product-price";
import { useQuery } from "@/lib/hooks/convex";

const promotionsApi = api.functions.promotions;

export const Route = createFileRoute("/promo/$code")({
  beforeLoad: ({ context, params }) => {
    if (!context.isAuthenticated) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: "/auth/sign-in",
        search: { redirect: `/promo/${encodeURIComponent(params.code)}` },
      });
    }
  },
  head: () => ({
    meta: [{ title: "Promotion | Redux Chat" }],
  }),
  component: PromoPage,
});

type PublicPromotion = {
  promotionId: string;
  code: string;
  name: string;
  description?: string;
  type: "gifted_credits" | "subscription_discount";
  startsAt?: number;
  endsAt?: number;
  isRedeemable: boolean;
  blockedReason?: string;
  alreadyRedeemed: boolean;
  singleUsePerUser?: boolean;
  newPaidSubscriptionsOnly?: boolean;
  creditAmount?: number;
  eligibleTiers?: ("plus" | "pro")[];
  discountType?: "fixed" | "percentage";
  amountCents?: number;
  percentBasisPoints?: number;
  duration?: "once" | "forever" | "repeating";
  durationInMonths?: number;
  currentTier: "free" | "plus" | "pro";
};

function subscriptionDealLabel(
  promo: Pick<
    PublicPromotion,
    | "discountType"
    | "amountCents"
    | "percentBasisPoints"
    | "duration"
    | "durationInMonths"
  >,
): string {
  const base =
    promo.discountType === "fixed" && promo.amountCents
      ? `${formatUsd(promo.amountCents)} off`
      : promo.discountType === "percentage" && promo.percentBasisPoints
        ? `${promo.percentBasisPoints / 100}% off`
        : "Discounted subscription";

  const durationKind = promo.duration ?? "once";

  if (durationKind === "forever") {
    return `${base} forever`;
  }
  if (durationKind === "once") {
    return `${base} for 1 month`;
  }

  const months = promo.durationInMonths;
  if (typeof months === "number" && Number.isInteger(months) && months > 0) {
    return `${base} for ${months} ${months === 1 ? "month" : "months"}`;
  }

  return base;
}

function promoDiscountedRecurringCents(
  baseMinorUnits: number,
  promo: Pick<
    PublicPromotion,
    "discountType" | "amountCents" | "percentBasisPoints"
  >,
): number | undefined {
  if (promo.discountType === "percentage") {
    const bps = promo.percentBasisPoints;
    if (typeof bps !== "number" || bps <= 0 || bps > 10_000) {
      return undefined;
    }
    return Math.round((baseMinorUnits * (10_000 - bps)) / 10_000);
  }
  if (promo.discountType === "fixed") {
    const off = promo.amountCents;
    if (typeof off !== "number" || off <= 0) {
      return undefined;
    }
    return Math.max(0, baseMinorUnits - off);
  }
  return undefined;
}

function PromoPage() {
  const { code } = Route.useParams();
  const promo = useQuery(promotionsApi.getPromotionByCode, { code });
  const billingState = useQuery(
    api.functions.billing.getCurrentBillingState,
    {},
  );

  if (promo === undefined) {
    return <PromoShell title="Loading promotion..." />;
  }
  if (promo === null) {
    return (
      <PromoShell title="Promotion not found">
        <p className="text-muted-foreground text-sm">
          Check the code and try again.
        </p>
      </PromoShell>
    );
  }

  const effectivePromo =
    promo.type === "subscription_discount" &&
    promo.newPaidSubscriptionsOnly !== false &&
    billingState?.tier !== undefined &&
    billingState.tier !== "free"
      ? {
          ...promo,
          isRedeemable: false,
          blockedReason: "paid_subscriber",
          currentTier: billingState.tier,
        }
      : promo;

  return effectivePromo.type === "gifted_credits" ? (
    <GiftedPromo promo={effectivePromo} />
  ) : (
    <SubscriptionPromo promo={effectivePromo} />
  );
}

function GiftedPromo({ promo }: { promo: PublicPromotion }) {
  const redeem = useMutation(promotionsApi.redeemGiftedCreditsPromotion);
  const [state, setState] = useState<
    "idle" | "applying" | "applied" | "already" | "error"
  >(
    promo.alreadyRedeemed
      ? "already"
      : promo.isRedeemable
        ? "applying"
        : "idle",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!promo.isRedeemable || promo.alreadyRedeemed || state !== "applying") {
      return;
    }
    let cancelled = false;
    void redeem({ code: promo.code })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setState(result.status === "already_redeemed" ? "already" : "applied");
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(
          err instanceof Error ? err.message : "Could not redeem promotion.",
        );
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [promo, redeem, state]);

  const title =
    state === "applied"
      ? "Credits added"
      : state === "already"
        ? "Already redeemed"
        : promo.isRedeemable
          ? "Applying credits"
          : "Promotion unavailable";

  return (
    <PromoShell
      title={title}
      subtitle={promo.name}
      icon={<Gift className="size-5" aria-hidden />}
    >
      <div className="grid gap-5">
        {promo.creditAmount ? (
          <div className="border-border/80 bg-background/70 rounded-lg border p-4 shadow-sm">
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className="text-muted-foreground text-xs font-medium">
                  Gifted credits
                </span>
                <p className="mt-1 font-mono text-3xl font-semibold tabular-nums">
                  {formatNumber(promo.creditAmount)}
                </p>
              </div>
              <div className="bg-primary/10 text-primary flex size-9 items-center justify-center rounded-md">
                <Sparkles className="size-4" aria-hidden />
              </div>
            </div>
          </div>
        ) : null}
        {state === "applying" ? (
          <p className="text-sm">Applying this promotion to your account...</p>
        ) : state === "applied" ? (
          <SuccessMessage>Gifted credits are now available.</SuccessMessage>
        ) : state === "already" ? (
          <SuccessMessage>
            You have already redeemed this promotion.
          </SuccessMessage>
        ) : state === "error" ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : !promo.isRedeemable ? (
          <BlockedReason reason={promo.blockedReason} />
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="sm:flex-1" render={<Link to="/" />}>
            Open chat
            <ArrowRight data-icon="inline-end" className="size-4" />
          </Button>
          <Button variant="outline" render={<Link to="/settings" />}>
            Billing
          </Button>
        </div>
      </div>
    </PromoShell>
  );
}

function SubscriptionPromo({ promo }: { promo: PublicPromotion }) {
  const polarProducts = useQuery(api.polar.getConfiguredProducts, {});
  const createCheckout = useAction(
    promotionsApi.createPromotionSubscriptionCheckout,
  );
  const [loadingTier, setLoadingTier] = useState<"plus" | "pro" | null>(null);
  const eligibleTiers = promo.eligibleTiers?.length
    ? promo.eligibleTiers
    : (["plus", "pro"] as const);

  const discountLabel = useMemo(() => subscriptionDealLabel(promo), [promo]);

  const startCheckout = async (tier: "plus" | "pro") => {
    setLoadingTier(tier);
    try {
      const checkout = await createCheckout({ code: promo.code, tier });
      window.location.assign(checkout.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create checkout.",
      );
      setLoadingTier(null);
    }
  };

  return (
    <PromoShell
      title={promo.alreadyRedeemed ? "Already redeemed" : promo.name}
      subtitle="Redux Chat promotion"
      icon={<Percent className="size-5" aria-hidden />}
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{promo.code}</Badge>
          <Badge variant="outline">{discountLabel}</Badge>
        </div>
        {promo.description ? (
          <p className="text-muted-foreground text-sm">{promo.description}</p>
        ) : null}
        {promo.alreadyRedeemed ? (
          <SuccessMessage>
            You have already redeemed this promotion.
          </SuccessMessage>
        ) : !promo.isRedeemable ? (
          <BlockedReason reason={promo.blockedReason} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {eligibleTiers.map((tier) => {
              const product =
                tier === "plus"
                  ? (polarProducts?.plus ?? null)
                  : (polarProducts?.pro ?? null);
              const polarPrice = getPolarRecurringPrice(product ?? undefined);
              const discountedMinor =
                polarPrice !== undefined
                  ? promoDiscountedRecurringCents(polarPrice.amount, promo)
                  : undefined;
              const showPromoPrice =
                polarPrice !== undefined && discountedMinor !== undefined;
              return (
                <Card
                  key={tier}
                  className="border-border/80 bg-background/70 gap-4 p-5 shadow-sm ring-0"
                >
                  <div>
                    <p className="text-lg leading-none font-semibold">
                      {tier === "plus" ? "Plus" : "Pro"}
                    </p>
                    {showPromoPrice ? (
                      <>
                        <p className="text-foreground mt-2 flex flex-wrap items-baseline gap-x-1.5 font-mono text-lg font-semibold tabular-nums">
                          <span>
                            {formatCurrencyFromMinorUnits(
                              discountedMinor,
                              polarPrice.currency,
                            )}
                            /mo
                          </span>
                          <span className="text-muted-foreground font-sans text-sm font-normal">
                            (+ tax)
                          </span>
                        </p>
                        {discountedMinor < polarPrice.amount ? (
                          <p className="text-muted-foreground mt-1 text-xs tabular-nums line-through">
                            {formatCurrencyFromMinorUnits(
                              polarPrice.amount,
                              polarPrice.currency,
                            )}
                            /mo
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <p className="text-foreground mt-2 font-mono text-lg font-semibold tabular-nums">
                          {polarPrice !== undefined
                            ? `${formatCurrencyFromMinorUnits(
                                polarPrice.amount,
                                polarPrice.currency,
                              )}/mo`
                            : "—"}
                        </p>
                        {polarPrice !== undefined ? (
                          <p className="text-muted-foreground mt-1 text-sm">
                            {discountLabel} at checkout
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    disabled={loadingTier !== null}
                    onClick={() => void startCheckout(tier)}
                  >
                    {loadingTier === tier
                      ? "Opening..."
                      : `Subscribe to ${tier === "plus" ? "Plus" : "Pro"}`}
                    <ArrowRight data-icon="inline-end" className="size-4" />
                  </Button>
                </Card>
              );
            })}
          </div>
        )}
        <Button variant="outline" render={<Link to="/settings" />}>
          View plans
        </Button>
      </div>
    </PromoShell>
  );
}

function PromoShell({
  title,
  subtitle = "Redux Chat promotion",
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <main className="bg-background text-foreground relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <Card className="border-border/80 bg-card/95 relative w-full max-w-[480px] gap-0 overflow-hidden p-0 shadow-2xl ring-1 shadow-black/10 ring-white/5">
        <div className="grid gap-6 p-6">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 text-primary ring-primary/15 flex size-11 shrink-0 items-center justify-center rounded-lg ring-1">
              {icon}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl leading-tight font-semibold tracking-tight">
                {title}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
            </div>
          </div>
          {children}
        </div>
      </Card>
    </main>
  );
}

function SuccessMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="size-4" aria-hidden />
      {children}
    </div>
  );
}

function BlockedReason({ reason }: { reason?: string }) {
  const message =
    reason === "paid_subscriber"
      ? "This promotion is for new paid subscriptions."
      : reason === "not_started"
        ? "This promotion has not started yet."
        : reason === "expired"
          ? "This promotion has expired."
          : reason === "full"
            ? "This promotion has reached its redemption limit."
            : reason === "paused"
              ? "This promotion is currently paused."
              : "This promotion is unavailable.";
  return (
    <p className="text-destructive text-sm" role="alert">
      {message}
    </p>
  );
}

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}
