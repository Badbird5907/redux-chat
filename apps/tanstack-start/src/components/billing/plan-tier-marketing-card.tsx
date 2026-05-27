import type { ReactNode } from "react";

import type { getPlanConfig, PlanTier } from "@redux/shared";
import { Card } from "@redux/ui/components/card";
import { cn } from "@redux/ui/lib/utils";

import { formatNumber } from "@/components/billing/credit-balance-panel";

export type StripePlanPrice = {
  id: string;
  amount?: number | null;
  currency?: string | null;
} | null;

export function planTierMarketingFeatures(tier: PlanTier): string[] {
  if (tier === "free") {
    return ["1 attachment per message (up to 10 MB)"];
  }
  if (tier === "plus") {
    return [
      "Multiple attachments per message",
      "Project workspaces & knowledge search",
      "Web search and analysis tools (credits apply)",
    ];
  }
  return ["All features from Plus"];
}

export function getStripeRecurringPrice(product: StripePlanPrice | undefined):
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

export function formatCurrencyFromMinorUnits(
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

export function formatStripeRecurringPrice(
  product: StripePlanPrice | undefined,
): string | undefined {
  const price = getStripeRecurringPrice(product);
  if (!price) {
    return undefined;
  }

  return formatCurrencyFromMinorUnits(price.amount, price.currency);
}

function priceLineFromLabel(
  name: string,
  priceLabel: string | undefined,
  compareAtPriceLabel: string | undefined,
): ReactNode {
  if (compareAtPriceLabel !== undefined && priceLabel !== undefined) {
    return (
      <>
        <span className="text-muted-foreground decoration-muted-foreground/70 font-normal line-through">
          {compareAtPriceLabel}
        </span>{" "}
        <span>{priceLabel}/mo</span>
      </>
    );
  }
  if (priceLabel !== undefined) {
    return `${priceLabel}/mo`;
  }
  if (name === "Free") {
    return "$0/mo";
  }
  return "—";
}

export type PlanTierMarketingPlan = ReturnType<typeof getPlanConfig>;

export function PlanTierMarketingCard({
  name,
  plan,
  priceLabel,
  compareAtPriceLabel,
  renewalLine,
  footer,
  state,
  emphasize,
  className,
  onSelect,
  selected,
}: {
  name: string;
  plan: PlanTierMarketingPlan;
  priceLabel?: string;
  compareAtPriceLabel?: string;
  renewalLine?: string | null;
  footer: ReactNode;
  state: "current" | "available" | "inactive";
  emphasize?: boolean;
  className?: string;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const priced = priceLineFromLabel(name, priceLabel, compareAtPriceLabel);

  const ringSelected = Boolean(onSelect && selected);

  const stateClass =
    state === "current"
      ? "border-primary/25 bg-primary/6 ring-primary/15 ring-1"
      : emphasize && state === "available"
        ? "border-primary/30 shadow-sm"
        : ringSelected
          ? "border-primary/25 bg-primary/6 ring-primary/15 ring-1"
          : null;

  const body = (
    <>
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
            credits per month
          </span>
        </li>
        {planTierMarketingFeatures(plan.tier).map((line) => (
          <li key={line} className="flex gap-2.5">
            <span className="text-primary mt-1.5 size-1 shrink-0 rounded-full bg-current" />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">{footer}</div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        disabled={state === "inactive"}
        onClick={onSelect}
        aria-pressed={selected}
        className={cn(
          "border-border/50 bg-card/50 text-card-foreground group/card hover:bg-accent/35 focus-visible:ring-ring/55 flex min-h-[220px] flex-col gap-0 overflow-hidden rounded-2xl border px-5 py-6 text-left text-sm shadow-none transition-colors outline-none focus-visible:ring-[3px]",
          stateClass,
          state === "inactive" && "pointer-events-none opacity-50",
          className,
        )}
      >
        {body}
      </button>
    );
  }

  return (
    <Card
      className={cn(
        "flex min-h-[220px] flex-col gap-0 px-5 py-6",
        stateClass,
        className,
      )}
    >
      {body}
    </Card>
  );
}
