export type PolarPlanProduct = {
  prices?: readonly {
    priceAmount?: number | null;
    priceCurrency?: string | null;
  }[];
} | null;

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

export function getPolarRecurringPrice(product: PolarPlanProduct | undefined):
  | {
      amount: number;
      currency: string;
    }
  | undefined {
  const price = product?.prices?.[0];
  if (!price || typeof price.priceAmount !== "number") {
    return undefined;
  }
  if (price.priceAmount < 0) {
    return undefined;
  }
  return {
    amount: price.priceAmount,
    currency: (price.priceCurrency ?? "USD").toUpperCase(),
  };
}

export function formatPolarRecurringPrice(
  product: PolarPlanProduct | undefined,
): string | undefined {
  const price = getPolarRecurringPrice(product);
  if (!price) {
    return undefined;
  }

  return formatCurrencyFromMinorUnits(price.amount, price.currency);
}
