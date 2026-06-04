import type {
  PlanTier,
  PromotionKind,
  PromotionStatus,
  SubscriptionPromotionConfig,
} from "@redux/shared";
import { UNLIMITED_PER_USER_REDEMPTIONS } from "@redux/shared";

export type PerUserMode = "once" | "limited" | "unlimited";
export type PromotionFormType =
  | "app_credits"
  | "subscription_discount"
  | "gifted_subscription"
  | "stripe_invoice_credit";
export type SubscriptionDuration = "once" | "repeating" | "forever";
export type DiscountType = "percent" | "amount";
export type TargetTierMode = "all" | "plus" | "pro";
export type AppCreditPlanEligibilityMode = "all" | "selected";
export type AppCreditExpiryMode = "never" | "after_days" | "fixed_date";

export type PromotionFormDialogPromotion = {
  promotionId: string;
  code: string;
  name: string;
  description?: string;
  status: PromotionStatus;
  kind: PromotionKind;
  maxRedemptions?: number;
  perUserRedemptionLimit?: number;
  pauseOnRedemptionLimit?: boolean;
  startsAt?: number;
  endsAt?: number;
  metadata?: unknown;
};

export const promotionTypeRadioTileClass =
  "flex min-w-[11rem] flex-1 cursor-pointer gap-3 rounded-lg border bg-card/50 p-3.5 text-left shadow-sm outline-none transition-colors hover:bg-accent/35 focus-visible:ring-[3px] focus-visible:ring-ring/55 [&:has([data-checked])]:border-primary [&:has([data-checked])]:bg-primary/5";

export const perUserRadioTileClass =
  "flex min-h-[4.25rem] min-w-[7.75rem] flex-1 cursor-pointer gap-3 rounded-lg border bg-card/50 p-3 text-left shadow-sm outline-none transition-colors hover:bg-accent/35 focus-visible:ring-[3px] focus-visible:ring-ring/55 [&:has([data-checked])]:border-primary [&:has([data-checked])]:bg-primary/5";

export const PROMOTION_TYPE_OPTIONS: {
  value: PromotionFormType;
  label: string;
  hint: string;
}[] = [
  {
    value: "app_credits",
    label: "Gifted credits",
    hint: "Add in-app credits to the recipient wallet.",
  },
  {
    value: "subscription_discount",
    label: "Subscription discount",
    hint: "Percent or fixed USD off subscription invoices.",
  },
  {
    value: "gifted_subscription",
    label: "Gifted subscription",
    hint: "100% off targeted tier until duration ends.",
  },
  {
    value: "stripe_invoice_credit",
    label: "Invoice credit",
    hint: "Apply USD to Stripe customer balance toward future invoices.",
  },
];

export function isPromotionFormType(
  value: string | null,
): value is PromotionFormType {
  return (
    value === "app_credits" ||
    value === "subscription_discount" ||
    value === "gifted_subscription" ||
    value === "stripe_invoice_credit"
  );
}

export function isPromotionStatus(
  value: string | null,
): value is PromotionStatus {
  return (
    value === "draft" ||
    value === "active" ||
    value === "paused" ||
    value === "archived"
  );
}

export function isPerUserMode(value: string | null): value is PerUserMode {
  return value === "once" || value === "limited" || value === "unlimited";
}

export function isSubscriptionDuration(
  value: string | null,
): value is SubscriptionDuration {
  return value === "once" || value === "repeating" || value === "forever";
}

export function isDiscountType(value: string | null): value is DiscountType {
  return value === "percent" || value === "amount";
}

export function metadataConfig(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object") return undefined;
  return (metadata as { config?: unknown }).config;
}

export function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function parseDate(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

export function formatDateInput(value: number | undefined): string {
  if (value === undefined) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function storedPerUserLimit(
  mode: PerUserMode,
  limit: string,
): number | undefined {
  if (mode === "once") return undefined;
  if (mode === "unlimited") return UNLIMITED_PER_USER_REDEMPTIONS;
  const parsed = Number(limit);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function perUserModeFromStored(limit: number | undefined): PerUserMode {
  if (limit === undefined) return "once";
  if (limit === UNLIMITED_PER_USER_REDEMPTIONS) return "unlimited";
  return "limited";
}

export function targetTierModeFromStored(
  targetTiers: SubscriptionPromotionConfig["targetTiers"] | undefined,
): TargetTierMode {
  if (targetTiers === "all") return "all";
  const targetTier = Array.isArray(targetTiers) ? targetTiers[0] : undefined;
  return targetTier === "plus" || targetTier === "pro" ? targetTier : "all";
}

export function appCreditPlanEligibilityModeFromStored(
  eligiblePlanTiers: unknown,
): AppCreditPlanEligibilityMode {
  return Array.isArray(eligiblePlanTiers) ? "selected" : "all";
}

export function appCreditSelectedPlanTiersFromStored(
  eligiblePlanTiers: unknown,
): PlanTier[] {
  if (!Array.isArray(eligiblePlanTiers)) return ["free", "plus", "pro"];
  const tiers = eligiblePlanTiers.filter(
    (tier): tier is PlanTier =>
      tier === "free" || tier === "plus" || tier === "pro",
  );
  return tiers.length > 0 ? tiers : ["free"];
}

export function usdDollarsStringToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  return cents > 0 ? cents : null;
}

export function promotionTypeFromPromotion(
  promotion: PromotionFormDialogPromotion | undefined,
): PromotionFormType {
  if (!promotion) return "app_credits";
  if (promotion.kind === "app_credits") return "app_credits";
  if (promotion.kind === "stripe_invoice_credit")
    return "stripe_invoice_credit";
  const config = objectValue(metadataConfig(promotion.metadata));
  return config.mode === "gifted_subscription"
    ? "gifted_subscription"
    : "subscription_discount";
}

export function validatePromotionForm(args: {
  name: string;
  promotionType: PromotionFormType;
  amount: string;
  appCreditExpiryMode: AppCreditExpiryMode;
  appCreditExpiryDays: string;
  appCreditExpiryDate: string;
  appCreditPlanEligibilityMode: AppCreditPlanEligibilityMode;
  appCreditSelectedPlanTiers: PlanTier[];
  discountType: DiscountType;
  percentOff: string;
  amountOffCents: string;
  duration: SubscriptionDuration;
  durationMonths: string;
  maxRedemptions: string;
  perUserMode: PerUserMode;
  perUserLimit: string;
  startsAt: string;
  endsAt: string;
  invoiceCreditUsd: string;
}): string | null {
  if (args.name.trim() === "") return "Promotion name is required.";

  const creditAmount = Number(args.amount);
  if (
    args.promotionType === "app_credits" &&
    (!Number.isInteger(creditAmount) || creditAmount <= 0)
  ) {
    return "Credit amount must be a positive integer.";
  }

  const expiryDays = Number(args.appCreditExpiryDays);
  if (
    args.promotionType === "app_credits" &&
    args.appCreditExpiryMode === "after_days" &&
    (!Number.isInteger(expiryDays) || expiryDays <= 0)
  ) {
    return "Expiration days must be a positive integer.";
  }

  const expiryDateMs = parseDate(args.appCreditExpiryDate);
  if (
    args.promotionType === "app_credits" &&
    args.appCreditExpiryMode === "fixed_date" &&
    expiryDateMs === undefined
  ) {
    return "Expiration date is invalid.";
  }

  const percent = Number(args.percentOff);
  if (
    args.promotionType === "subscription_discount" &&
    args.discountType === "percent" &&
    (!Number.isFinite(percent) || percent <= 0 || percent > 100)
  ) {
    return "Percent discount must be between 1 and 100.";
  }

  const amountDiscount = Number(args.amountOffCents);
  if (
    args.promotionType === "subscription_discount" &&
    args.discountType === "amount" &&
    (!Number.isInteger(amountDiscount) || amountDiscount <= 0)
  ) {
    return "Amount discount must be a positive cent amount.";
  }

  const repeatingMonths = Number(args.durationMonths);
  if (
    args.duration === "repeating" &&
    (!Number.isInteger(repeatingMonths) || repeatingMonths <= 0)
  ) {
    return "Repeating duration must be a positive month count.";
  }

  const max =
    args.maxRedemptions.trim() === "" ? undefined : Number(args.maxRedemptions);
  if (
    args.maxRedemptions.trim() !== "" &&
    (!Number.isInteger(max) || (max ?? 0) <= 0)
  ) {
    return "Global redemption limit must be positive.";
  }

  const perUserRedemptionLimit = storedPerUserLimit(
    args.perUserMode,
    args.perUserLimit,
  );
  if (args.perUserMode === "limited" && perUserRedemptionLimit === undefined) {
    return "Per-user limit must be positive.";
  }

  if (
    args.promotionType === "app_credits" &&
    args.appCreditPlanEligibilityMode === "selected" &&
    args.appCreditSelectedPlanTiers.length === 0
  ) {
    return "Select at least one eligible plan.";
  }

  if (
    args.promotionType === "stripe_invoice_credit" &&
    usdDollarsStringToCents(args.invoiceCreditUsd) === null
  ) {
    return "Invoice credit must be a positive USD amount.";
  }

  const starts = parseDate(args.startsAt);
  const ends = parseDate(args.endsAt);
  if (args.startsAt.trim() !== "" && starts === undefined) {
    return "Start date is invalid.";
  }
  if (args.endsAt.trim() !== "" && ends === undefined) {
    return "End date is invalid.";
  }
  if (starts !== undefined && ends !== undefined && ends <= starts) {
    return "End date must be after start date.";
  }

  return null;
}

export function buildPromotionConfig(args: {
  promotionType: PromotionFormType;
  amount: string;
  appCreditPlanEligibilityMode: AppCreditPlanEligibilityMode;
  appCreditSelectedPlanTiers: PlanTier[];
  appCreditExpiryMode: AppCreditExpiryMode;
  appCreditExpiryDays: string;
  appCreditExpiryDate: string;
  invoiceCreditUsd: string;
  freeUsersOnly: boolean;
  targetTierMode: TargetTierMode;
  discountType: DiscountType;
  percentOff: string;
  amountOffCents: string;
  duration: SubscriptionDuration;
  durationMonths: string;
}): {
  kind: PromotionKind;
  config: Record<string, unknown>;
} {
  const kind: PromotionKind =
    args.promotionType === "stripe_invoice_credit"
      ? "stripe_invoice_credit"
      : args.promotionType === "app_credits"
        ? "app_credits"
        : "subscription_discount";

  if (args.promotionType === "app_credits") {
    const expiryDays = Number(args.appCreditExpiryDays);
    const expiryDateMs = parseDate(args.appCreditExpiryDate);
    return {
      kind,
      config: {
        amount: Number(args.amount),
        eligiblePlanTiers:
          args.appCreditPlanEligibilityMode === "all"
            ? "all"
            : args.appCreditSelectedPlanTiers,
        ...(args.appCreditExpiryMode === "after_days"
          ? { expiresAfterDays: expiryDays }
          : args.appCreditExpiryMode === "fixed_date"
            ? { expiresAt: expiryDateMs }
            : {}),
      },
    };
  }

  if (args.promotionType === "stripe_invoice_credit") {
    return {
      kind,
      config: {
        amountCents: usdDollarsStringToCents(args.invoiceCreditUsd),
        currency: "usd",
      },
    };
  }

  const percent = Number(args.percentOff);
  const amountDiscount = Number(args.amountOffCents);
  const repeatingMonths = Number(args.durationMonths);

  return {
    kind,
    config: {
      mode:
        args.promotionType === "gifted_subscription"
          ? "gifted_subscription"
          : "discount",
      freeUsersOnly: args.freeUsersOnly,
      targetTiers:
        args.targetTierMode === "all"
          ? "all"
          : ([args.targetTierMode] as const),
      discount:
        args.promotionType === "gifted_subscription"
          ? { type: "percent", percentOff: 100 }
          : args.discountType === "percent"
            ? { type: "percent", percentOff: percent }
            : {
                type: "amount",
                amountOffCents: amountDiscount,
                currency: "usd",
              },
      duration:
        args.duration === "repeating"
          ? { type: "repeating", months: repeatingMonths }
          : { type: args.duration },
      requirePaymentMethod: args.promotionType !== "gifted_subscription",
      cancelIfMissingPaymentMethodAtEnd:
        args.promotionType === "gifted_subscription",
    },
  };
}
