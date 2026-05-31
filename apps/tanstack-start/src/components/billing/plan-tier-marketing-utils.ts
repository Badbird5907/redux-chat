import type { getPlanConfig, PlanTier } from "@redux/shared";

const currencyFormatters = new Map<string, Intl.NumberFormat>();

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

export type StripePlanPrice = {
  id: string;
  amount?: number | null;
  currency?: string | null;
} | null;

export type PlanTierMarketingPlan = ReturnType<typeof getPlanConfig>;

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
    return getCurrencyFormatter(currency).format(amount / 100);
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
