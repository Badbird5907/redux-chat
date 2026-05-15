import { useEffect, useRef, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { CheckCircle2, Gift } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";

import { formatDate } from "@/components/admin/user-detail/utils";

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

function RedeemPromotionPage() {
  const { code } = Route.useParams();
  const promotion = useQuery(api.functions.promotions.getPromotionByCode, {
    code,
  });
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
    targetTier?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const attempted = useRef(false);

  const redeem = async () => {
    setPending(true);
    setError(null);
    try {
      const redeemed = await redeemPromotion({ code, targetTier });
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
    if (attempted.current || promotion === undefined || promotion === null) {
      return;
    }
    if (promotion.requiresTargetTierSelection) {
      return;
    }
    if (
      promotion.kind === "subscription_discount" &&
      promotion.requiresCheckout
    ) {
      return;
    }
    attempted.current = true;
    const timeout = window.setTimeout(() => void redeem(), 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotion]);

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
  }, [cancelPendingCheckout]);

  if (promotion === undefined) {
    return (
      <main className="bg-muted/35 flex min-h-screen items-center justify-center p-6">
        <p className="text-muted-foreground text-sm">Loading promotion…</p>
      </main>
    );
  }

  if (promotion === null) {
    return (
      <main className="bg-muted/35 flex min-h-screen items-center justify-center p-6">
        <section className="bg-card border-border/70 w-full max-w-md rounded-xl border p-6 text-center">
          <Gift className="text-muted-foreground mx-auto size-8" />
          <h1 className="mt-4 text-xl font-semibold">Promotion not found</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            This code does not match an active promotion.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="bg-muted/35 flex min-h-screen items-center justify-center p-6">
      <section className="bg-card border-border/70 w-full max-w-md rounded-xl border p-6">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary rounded-lg p-2">
            <Gift className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{promotion.name}</h1>
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              {promotion.code}
            </p>
          </div>
        </div>

        {promotion.description ? (
          <p className="text-muted-foreground mt-4 text-sm">
            {promotion.description}
          </p>
        ) : null}

        <dl className="text-muted-foreground mt-5 grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt>Benefit</dt>
            <dd className="text-foreground text-right">
              {promotion.configSummary}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Per-user redemptions</dt>
            <dd className="text-foreground text-right">
              {promotion.perUserRedemptionLabel}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Your redemptions</dt>
            <dd className="text-foreground tabular-nums">
              {promotion.userRedemptionCount.toLocaleString()}
            </dd>
          </div>
          {promotion.endsAt ? (
            <div className="flex justify-between gap-4">
              <dt>Ends</dt>
              <dd className="text-foreground text-right">
                {formatDate(promotion.endsAt)}
              </dd>
            </div>
          ) : null}
        </dl>

        {promotion.kind === "subscription_discount" &&
        promotion.redeemableTargetTiers.length > 1 ? (
          <div className="mt-5 grid gap-2">
            <label className="text-sm font-medium">Subscription tier</label>
            <Select
              value={targetTier}
              onValueChange={(value) => {
                if (value === "plus" || value === "pro") {
                  setTargetTier(value);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose Plus or Pro" />
              </SelectTrigger>
              <SelectContent>
                {promotion.redeemableTargetTiers.includes("plus") ? (
                  <SelectItem value="plus">Plus</SelectItem>
                ) : null}
                {promotion.redeemableTargetTiers.includes("pro") ? (
                  <SelectItem value="pro">Pro</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {result ? (
          <div className="mt-5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-4" />
              Redeemed
            </div>
            <p className="text-muted-foreground mt-2">
              {result.kind === "stripe_invoice_credit" &&
              result.amountCents !== undefined
                ? `${formatCurrencyFromMinorUnits(
                    result.amountCents,
                    result.currency ?? "USD",
                  )} was added to your Stripe invoice balance.`
                : result.kind === "subscription_discount"
                  ? `${result.targetTier ?? "Subscription"} promotion applied.`
                  : `${result.amount.toLocaleString()} gifted credits were added to your account.`}
              {result.kind !== "stripe_invoice_credit" && result.expiresAt
                ? ` Expires ${formatDate(result.expiresAt)}.`
                : ""}
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="text-destructive mt-5 text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          type="button"
          className="mt-5 w-full"
          disabled={
            pending ||
            (promotion.kind === "subscription_discount" &&
              promotion.requiresTargetTierSelection &&
              targetTier === undefined)
          }
          onClick={() => void redeem()}
        >
          {pending
            ? "Redeeming…"
            : promotion.kind === "subscription_discount" &&
                promotion.requiresCheckout
              ? "Continue to checkout"
              : result
                ? "Redeem again"
                : "Redeem"}
        </Button>
      </section>
    </main>
  );
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
