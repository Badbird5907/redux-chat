import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation } from "convex/react";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import type {
  PromotionKind,
  PromotionStatus,
  SubscriptionPromotionConfig,
} from "@redux/shared";
import { api } from "@redux/backend/convex/_generated/api";
import {
  generatePromotionCode,
  UNLIMITED_PER_USER_REDEMPTIONS,
} from "@redux/shared";
import { Button } from "@redux/ui/components/button";
import { Checkbox } from "@redux/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@redux/ui/components/dialog";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import { RadioGroup, RadioGroupItem } from "@redux/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Separator } from "@redux/ui/components/separator";
import { Textarea } from "@redux/ui/components/textarea";

type PerUserMode = "once" | "limited" | "unlimited";
type PromotionFormType =
  | "app_credits"
  | "subscription_discount"
  | "gifted_subscription"
  | "stripe_invoice_credit";
type SubscriptionDuration = "once" | "repeating" | "forever";
type DiscountType = "percent" | "amount";
type TargetTierMode = "all" | "plus" | "pro";

export type PromotionFormDialogPromotion = {
  promotionId: string;
  code: string;
  name: string;
  description?: string;
  status: PromotionStatus;
  kind: PromotionKind;
  maxRedemptions?: number;
  perUserRedemptionLimit?: number;
  startsAt?: number;
  endsAt?: number;
  metadata?: unknown;
};

const promotionTypeRadioTileClass =
  "flex min-w-[11rem] flex-1 cursor-pointer gap-3 rounded-lg border bg-card/50 p-3.5 text-left shadow-sm outline-none transition-colors hover:bg-accent/35 focus-visible:ring-[3px] focus-visible:ring-ring/55 [&:has([data-checked])]:border-primary [&:has([data-checked])]:bg-primary/5";

const perUserRadioTileClass =
  "flex min-h-[4.25rem] min-w-[7.75rem] flex-1 cursor-pointer gap-3 rounded-lg border bg-card/50 p-3 text-left shadow-sm outline-none transition-colors hover:bg-accent/35 focus-visible:ring-[3px] focus-visible:ring-ring/55 [&:has([data-checked])]:border-primary [&:has([data-checked])]:bg-primary/5";

const PROMOTION_TYPE_OPTIONS: {
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

function isPromotionFormType(value: string | null): value is PromotionFormType {
  return (
    value === "app_credits" ||
    value === "subscription_discount" ||
    value === "gifted_subscription" ||
    value === "stripe_invoice_credit"
  );
}

function isPromotionStatus(value: string | null): value is PromotionStatus {
  return (
    value === "draft" ||
    value === "active" ||
    value === "paused" ||
    value === "archived"
  );
}

function isPerUserMode(value: string | null): value is PerUserMode {
  return value === "once" || value === "limited" || value === "unlimited";
}

function isSubscriptionDuration(
  value: string | null,
): value is SubscriptionDuration {
  return value === "once" || value === "repeating" || value === "forever";
}

function isDiscountType(value: string | null): value is DiscountType {
  return value === "percent" || value === "amount";
}

function metadataConfig(metadata: unknown): unknown {
  if (!metadata || typeof metadata !== "object") return undefined;
  return (metadata as { config?: unknown }).config;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function parseDate(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function formatDateInput(value: number | undefined): string {
  if (value === undefined) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function storedPerUserLimit(
  mode: PerUserMode,
  limit: string,
): number | undefined {
  if (mode === "once") return undefined;
  if (mode === "unlimited") return UNLIMITED_PER_USER_REDEMPTIONS;
  const parsed = Number(limit);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function perUserModeFromStored(limit: number | undefined): PerUserMode {
  if (limit === undefined) return "once";
  if (limit === UNLIMITED_PER_USER_REDEMPTIONS) return "unlimited";
  return "limited";
}

function targetTierModeFromStored(
  targetTiers: SubscriptionPromotionConfig["targetTiers"] | undefined,
): TargetTierMode {
  if (targetTiers === "all") return "all";
  const targetTier = Array.isArray(targetTiers) ? targetTiers[0] : undefined;
  return targetTier === "plus" || targetTier === "pro" ? targetTier : "all";
}

function usdDollarsStringToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  return cents > 0 ? cents : null;
}

function promotionTypeFromPromotion(
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

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description ? (
          <p className="text-muted-foreground text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function PromotionFormDialog({
  mode,
  promotion,
}: {
  mode: "create" | "edit";
  promotion?: PromotionFormDialogPromotion;
}) {
  const createPromotion = useMutation(
    api.functions.promotions.adminCreatePromotion,
  );
  const updatePromotion = useMutation(
    api.functions.promotions.adminUpdatePromotion,
  );
  const config = objectValue(metadataConfig(promotion?.metadata));
  const subscriptionConfig =
    promotion?.kind === "subscription_discount"
      ? (config as SubscriptionPromotionConfig)
      : undefined;
  const subscriptionDiscount = objectValue(subscriptionConfig?.discount);
  const subscriptionDuration = objectValue(subscriptionConfig?.duration);
  const initialPromotionType = promotionTypeFromPromotion(promotion);
  const initialTargetTierMode = targetTierModeFromStored(
    subscriptionConfig?.targetTiers,
  );
  const initialDuration =
    subscriptionDuration.type === "repeating" ||
    subscriptionDuration.type === "forever"
      ? subscriptionDuration.type
      : "once";
  const initialPerUserMode = perUserModeFromStored(
    promotion?.perUserRedemptionLimit,
  );

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(promotion?.code ?? generatePromotionCode());
  const [name, setName] = useState(promotion?.name ?? "");
  const [description, setDescription] = useState(promotion?.description ?? "");
  const [status, setStatus] = useState<PromotionStatus>(
    promotion?.status ?? "active",
  );
  const [promotionType, setPromotionType] =
    useState<PromotionFormType>(initialPromotionType);
  const [amount, setAmount] = useState(
    typeof config.amount === "number" ? config.amount.toString() : "",
  );
  const [invoiceCreditUsd, setInvoiceCreditUsd] = useState(
    typeof config.amountCents === "number"
      ? (config.amountCents / 100).toFixed(2)
      : "",
  );
  const [targetTierMode, setTargetTierMode] = useState<TargetTierMode>(
    initialTargetTierMode,
  );
  const [freeUsersOnly, setFreeUsersOnly] = useState(
    subscriptionConfig?.freeUsersOnly !== false,
  );
  const [discountType, setDiscountType] = useState<DiscountType>(
    subscriptionDiscount.type === "amount" ? "amount" : "percent",
  );
  const [percentOff, setPercentOff] = useState(
    typeof subscriptionDiscount.percentOff === "number"
      ? subscriptionDiscount.percentOff.toString()
      : "",
  );
  const [amountOffCents, setAmountOffCents] = useState(
    typeof subscriptionDiscount.amountOffCents === "number"
      ? subscriptionDiscount.amountOffCents.toString()
      : "",
  );
  const [duration, setDuration] =
    useState<SubscriptionDuration>(initialDuration);
  const [durationMonths, setDurationMonths] = useState(
    typeof subscriptionDuration.months === "number"
      ? subscriptionDuration.months.toString()
      : "3",
  );
  const [maxRedemptions, setMaxRedemptions] = useState(
    promotion?.maxRedemptions?.toString() ?? "",
  );
  const [perUserMode, setPerUserMode] =
    useState<PerUserMode>(initialPerUserMode);
  const [perUserLimit, setPerUserLimit] = useState(
    initialPerUserMode === "limited"
      ? (promotion?.perUserRedemptionLimit ?? 2).toString()
      : "2",
  );
  const [startsAt, setStartsAt] = useState(
    formatDateInput(promotion?.startsAt),
  );
  const [endsAt, setEndsAt] = useState(formatDateInput(promotion?.endsAt));

  const reset = () => {
    setCode(promotion?.code ?? generatePromotionCode());
    setName(promotion?.name ?? "");
    setDescription(promotion?.description ?? "");
    setStatus(promotion?.status ?? "active");
    setPromotionType(initialPromotionType);
    setAmount(
      typeof config.amount === "number" ? config.amount.toString() : "",
    );
    setInvoiceCreditUsd(
      typeof config.amountCents === "number"
        ? (config.amountCents / 100).toFixed(2)
        : "",
    );
    setTargetTierMode(initialTargetTierMode);
    setFreeUsersOnly(subscriptionConfig?.freeUsersOnly !== false);
    setDiscountType(
      subscriptionDiscount.type === "amount" ? "amount" : "percent",
    );
    setPercentOff(
      typeof subscriptionDiscount.percentOff === "number"
        ? subscriptionDiscount.percentOff.toString()
        : "",
    );
    setAmountOffCents(
      typeof subscriptionDiscount.amountOffCents === "number"
        ? subscriptionDiscount.amountOffCents.toString()
        : "",
    );
    setDuration(initialDuration);
    setDurationMonths(
      typeof subscriptionDuration.months === "number"
        ? subscriptionDuration.months.toString()
        : "3",
    );
    setMaxRedemptions(promotion?.maxRedemptions?.toString() ?? "");
    setPerUserMode(initialPerUserMode);
    setPerUserLimit(
      initialPerUserMode === "limited"
        ? (promotion?.perUserRedemptionLimit ?? 2).toString()
        : "2",
    );
    setStartsAt(formatDateInput(promotion?.startsAt));
    setEndsAt(formatDateInput(promotion?.endsAt));
  };

  const submit = async () => {
    if (name.trim() === "") {
      toast.error("Promotion name is required.");
      return;
    }

    const creditAmount = Number(amount);
    const invoiceAmountCents = usdDollarsStringToCents(invoiceCreditUsd);
    const percent = Number(percentOff);
    const amountDiscount = Number(amountOffCents);
    const repeatingMonths = Number(durationMonths);
    const max =
      maxRedemptions.trim() === "" ? undefined : Number(maxRedemptions);
    const perUserRedemptionLimit = storedPerUserLimit(
      perUserMode,
      perUserLimit,
    );
    const starts = parseDate(startsAt);
    const ends = parseDate(endsAt);

    if (
      promotionType === "app_credits" &&
      (!Number.isInteger(creditAmount) || creditAmount <= 0)
    ) {
      toast.error("Credit amount must be a positive integer.");
      return;
    }
    if (
      promotionType === "subscription_discount" &&
      discountType === "percent" &&
      (!Number.isFinite(percent) || percent <= 0 || percent > 100)
    ) {
      toast.error("Percent discount must be between 1 and 100.");
      return;
    }
    if (
      promotionType === "subscription_discount" &&
      discountType === "amount" &&
      (!Number.isInteger(amountDiscount) || amountDiscount <= 0)
    ) {
      toast.error("Amount discount must be a positive cent amount.");
      return;
    }
    if (
      duration === "repeating" &&
      (!Number.isInteger(repeatingMonths) || repeatingMonths <= 0)
    ) {
      toast.error("Repeating duration must be a positive month count.");
      return;
    }
    if (
      maxRedemptions.trim() !== "" &&
      (!Number.isInteger(max) || (max ?? 0) <= 0)
    ) {
      toast.error("Global redemption limit must be positive.");
      return;
    }
    if (perUserMode === "limited" && perUserRedemptionLimit === undefined) {
      toast.error("Per-user limit must be positive.");
      return;
    }
    if (startsAt.trim() !== "" && starts === undefined) {
      toast.error("Start date is invalid.");
      return;
    }
    if (endsAt.trim() !== "" && ends === undefined) {
      toast.error("End date is invalid.");
      return;
    }
    if (starts !== undefined && ends !== undefined && ends <= starts) {
      toast.error("End date must be after start date.");
      return;
    }

    const kind: PromotionKind =
      promotionType === "stripe_invoice_credit"
        ? "stripe_invoice_credit"
        : promotionType === "app_credits"
          ? "app_credits"
          : "subscription_discount";

    let config:
      | { amount: number }
      | { amountCents: number; currency: "usd" }
      | {
          mode: "gifted_subscription" | "discount";
          freeUsersOnly: boolean;
          targetTiers: "all" | readonly ["plus"] | readonly ["pro"];
          discount:
            | { type: "percent"; percentOff: number }
            | {
                type: "amount";
                amountOffCents: number;
                currency: "usd";
              };
          duration:
            | { type: "once" | "forever" }
            | { type: "repeating"; months: number };
          requirePaymentMethod: boolean;
          cancelIfMissingPaymentMethodAtEnd: boolean;
        };

    if (promotionType === "app_credits") {
      config = { amount: creditAmount };
    } else if (promotionType === "stripe_invoice_credit") {
      if (invoiceAmountCents === null) {
        toast.error("Invoice credit must be a positive USD amount.");
        return;
      }
      config = { amountCents: invoiceAmountCents, currency: "usd" };
    } else {
      config = {
        mode:
          promotionType === "gifted_subscription"
            ? "gifted_subscription"
            : "discount",
        freeUsersOnly,
        targetTiers:
          targetTierMode === "all" ? "all" : ([targetTierMode] as const),
        discount:
          promotionType === "gifted_subscription"
            ? { type: "percent", percentOff: 100 }
            : discountType === "percent"
              ? { type: "percent", percentOff: percent }
              : {
                  type: "amount",
                  amountOffCents: amountDiscount,
                  currency: "usd",
                },
        duration:
          duration === "repeating"
            ? { type: "repeating", months: repeatingMonths }
            : { type: duration },
        requirePaymentMethod: promotionType !== "gifted_subscription",
        cancelIfMissingPaymentMethodAtEnd:
          promotionType === "gifted_subscription",
      };
    }

    try {
      if (mode === "create") {
        await createPromotion({
          code,
          name,
          description: description.trim() || undefined,
          kind,
          status,
          maxRedemptions: max,
          perUserRedemptionLimit,
          startsAt: starts,
          endsAt: ends,
          config,
        });
        toast.success("Promotion created");
      } else {
        if (!promotion) return;
        await updatePromotion({
          promotionId: promotion.promotionId,
          code,
          name,
          description,
          kind,
          status,
          maxRedemptions: max ?? null,
          perUserRedemptionLimit: perUserRedemptionLimit ?? null,
          startsAt: starts ?? null,
          endsAt: ends ?? null,
          config,
        });
        toast.success("Promotion updated");
      }
      reset();
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `Failed to ${mode} promotion.`,
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) reset();
        setOpen(next);
      }}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant={mode === "create" ? "default" : "outline"}
          />
        }
      >
        {mode === "create" ? (
          <Plus className="size-4" />
        ) : (
          <Pencil className="size-4" />
        )}
        {mode === "create" ? "Create" : "Edit"}
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(92vh,840px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-border/60 shrink-0 space-y-1.5 border-b px-6 pt-6 pb-4">
          <DialogTitle>
            {mode === "create" ? "Create promotion" : "Edit promotion"}
          </DialogTitle>
          <DialogDescription>
            Codes are case-insensitive once saved. Leave schedule fields empty
            for no start or end bound; leave the global cap blank for unlimited
            total redemptions.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="flex flex-col gap-8">
            <FormSection
              title="Basics"
              description="What operators see in the admin list and what customers enter at checkout."
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor={`promotion-code-${mode}`}>Code</Label>
                  <div className="flex gap-2">
                    <Input
                      id={`promotion-code-${mode}`}
                      className="font-mono text-xs sm:text-sm"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setCode(generatePromotionCode())}
                    >
                      Generate
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`promotion-name-${mode}`}>Name</Label>
                  <Input
                    id={`promotion-name-${mode}`}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Launch gift"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`promotion-description-${mode}`}>
                    Description
                  </Label>
                  <Textarea
                    id={`promotion-description-${mode}`}
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Internal campaign note (optional)"
                  />
                </div>
                <div className="grid gap-2 sm:max-w-xs">
                  <Label>Status</Label>
                  <Select
                    value={status}
                    onValueChange={(value) => {
                      if (isPromotionStatus(value)) setStatus(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </FormSection>

            <Separator />

            <FormSection
              title="What this promotion grants"
              description="Pick a reward category. Detailed fields appear under the tiles."
            >
              <div className="grid gap-2">
                <span className="sr-only">Promotion type</span>
                <RadioGroup
                  orientation="horizontal"
                  value={promotionType}
                  onValueChange={(next) => {
                    const value = typeof next === "string" ? next : "";
                    if (isPromotionFormType(value)) setPromotionType(value);
                  }}
                  aria-label="Promotion type"
                  className="gap-3"
                >
                  {PROMOTION_TYPE_OPTIONS.map((opt) => (
                    <Label
                      key={opt.value}
                      className={promotionTypeRadioTileClass}
                    >
                      <RadioGroupItem value={opt.value} className="mt-0.5" />
                      <span className="min-w-0 flex-1 space-y-0.5 leading-snug">
                        <span className="block font-medium">{opt.label}</span>
                        <span className="text-muted-foreground block text-xs font-normal">
                          {opt.hint}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              {promotionType === "app_credits" ? (
                <div className="border-border/80 bg-muted/15 grid gap-2 rounded-xl border px-4 py-3">
                  <Label htmlFor={`promotion-credits-${mode}`}>
                    Gifted credits
                  </Label>
                  <Input
                    id={`promotion-credits-${mode}`}
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="100000"
                  />
                </div>
              ) : null}

              {promotionType === "stripe_invoice_credit" ? (
                <div className="border-border/80 bg-muted/15 grid gap-2 rounded-xl border px-4 py-3">
                  <Label htmlFor={`promotion-invoice-credit-${mode}`}>
                    Invoice credit (USD)
                  </Label>
                  <Input
                    id={`promotion-invoice-credit-${mode}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={invoiceCreditUsd}
                    onChange={(e) => setInvoiceCreditUsd(e.target.value)}
                    placeholder="25.32"
                  />
                </div>
              ) : null}

              {promotionType === "subscription_discount" ||
              promotionType === "gifted_subscription" ? (
                <div className="border-border/80 bg-muted/15 grid gap-5 rounded-xl border px-4 py-4">
                  <div className="grid min-w-0 gap-2">
                    <Label>Promotion applies to</Label>
                    <Select
                      value={targetTierMode}
                      onValueChange={(value) => {
                        if (
                          value === "all" ||
                          value === "plus" ||
                          value === "pro"
                        ) {
                          setTargetTierMode(value);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full min-w-0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">
                          All paid subscription tiers
                        </SelectItem>
                        <SelectItem value="plus">Plus only</SelectItem>
                        <SelectItem value="pro">Pro only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Label className="bg-card/50 flex items-start gap-3 rounded-lg border p-3">
                    <Checkbox
                      checked={freeUsersOnly}
                      onCheckedChange={(checked) =>
                        setFreeUsersOnly(checked === true)
                      }
                      className="mt-0.5"
                    />
                    <span className="grid gap-1">
                      <span className="text-sm font-medium">
                        Free users only
                      </span>
                      <span className="text-muted-foreground text-xs font-normal">
                        When disabled, existing paid subscribers can claim
                        same-tier full-discount promos as free subscription
                        time.
                      </span>
                    </span>
                  </Label>

                  {promotionType === "subscription_discount" ? (
                    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                      <div className="grid min-w-0 gap-2">
                        <Label>Discount shape</Label>
                        <Select
                          value={discountType}
                          onValueChange={(value) => {
                            if (isDiscountType(value)) setDiscountType(value);
                          }}
                        >
                          <SelectTrigger className="w-full min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="percent">Percentage</SelectItem>
                            <SelectItem value="amount">Fixed cents</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid min-w-0 gap-2">
                        <Label htmlFor={`promotion-discount-value-${mode}`}>
                          {discountType === "percent"
                            ? "Percent off"
                            : "Amount (cents USD)"}
                        </Label>
                        <Input
                          id={`promotion-discount-value-${mode}`}
                          type="number"
                          min={1}
                          step={1}
                          max={discountType === "percent" ? 100 : undefined}
                          value={
                            discountType === "percent"
                              ? percentOff
                              : amountOffCents
                          }
                          onChange={(e) =>
                            discountType === "percent"
                              ? setPercentOff(e.target.value)
                              : setAmountOffCents(e.target.value)
                          }
                          placeholder={
                            discountType === "percent" ? "25" : "500"
                          }
                        />
                      </div>
                    </div>
                  ) : null}

                  <div
                    className={
                      duration === "repeating"
                        ? "grid gap-x-5 gap-y-4 sm:grid-cols-2"
                        : "grid gap-x-5 gap-y-4"
                    }
                  >
                    <div className="grid min-w-0 gap-2">
                      <Label>How long the discount lasts</Label>
                      <Select
                        value={duration}
                        onValueChange={(value) => {
                          if (isSubscriptionDuration(value)) {
                            setDuration(value);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="once">
                            First invoice only
                          </SelectItem>
                          <SelectItem value="repeating">
                            A set number of months
                          </SelectItem>
                          <SelectItem value="forever">Forever</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {duration === "repeating" ? (
                      <div className="grid min-w-0 gap-2">
                        <Label htmlFor={`promotion-duration-months-${mode}`}>
                          Months
                        </Label>
                        <Input
                          id={`promotion-duration-months-${mode}`}
                          type="number"
                          min={1}
                          step={1}
                          value={durationMonths}
                          onChange={(e) => setDurationMonths(e.target.value)}
                          className="w-full max-w-32"
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </FormSection>

            <Separator />

            <FormSection
              title="Redemption limits"
              description="Control how widely a code may be redeemed before it expires."
            >
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label className="text-sm">Per customer</Label>
                  <RadioGroup
                    orientation="horizontal"
                    value={perUserMode}
                    onValueChange={(next) => {
                      const value = typeof next === "string" ? next : "";
                      if (isPerUserMode(value)) setPerUserMode(value);
                    }}
                    aria-label="Per-user redemption policy"
                  >
                    <Label className={perUserRadioTileClass}>
                      <RadioGroupItem value="once" />
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="block text-sm font-medium">Once</span>
                        <span className="text-muted-foreground block text-xs font-normal">
                          Single use per user
                        </span>
                      </span>
                    </Label>
                    <Label className={perUserRadioTileClass}>
                      <RadioGroupItem value="limited" />
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="block text-sm font-medium">
                          Limited
                        </span>
                        <span className="text-muted-foreground block text-xs font-normal">
                          Cap repeat redemptions
                        </span>
                      </span>
                    </Label>
                    <Label className={perUserRadioTileClass}>
                      <RadioGroupItem value="unlimited" />
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="block text-sm font-medium">
                          Unlimited
                        </span>
                        <span className="text-muted-foreground block text-xs font-normal">
                          No ceiling per user
                        </span>
                      </span>
                    </Label>
                  </RadioGroup>
                  {perUserMode === "limited" ? (
                    <div className="grid gap-2 sm:max-w-xs">
                      <Label htmlFor={`promotion-per-user-cap-${mode}`}>
                        Cap per customer
                      </Label>
                      <Input
                        id={`promotion-per-user-cap-${mode}`}
                        type="number"
                        min={1}
                        step={1}
                        value={perUserLimit}
                        onChange={(e) => setPerUserLimit(e.target.value)}
                        placeholder="2"
                      />
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={`promotion-max-${mode}`}>
                    Total redemptions (global)
                  </Label>
                  <Input
                    id={`promotion-max-${mode}`}
                    type="number"
                    min={1}
                    step={1}
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    placeholder="Unlimited across all users"
                  />
                </div>
              </div>
            </FormSection>

            <Separator />

            <FormSection
              title="Validity window"
              description="Both fields are optional. Blank start means redeemable immediately; blank end runs until manually paused."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`promotion-start-${mode}`}>
                    Starts (local)
                  </Label>
                  <Input
                    id={`promotion-start-${mode}`}
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`promotion-end-${mode}`}>Ends (local)</Label>
                  <Input
                    id={`promotion-end-${mode}`}
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              </div>
            </FormSection>
          </div>
        </div>

        <DialogFooter className="border-border/60 bg-background/95 supports-backdrop-filter:bg-background/80 shrink-0 border-t px-6 py-4 backdrop-blur-sm">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={() => void submit()}>
            {mode === "create" ? "Create promotion" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
