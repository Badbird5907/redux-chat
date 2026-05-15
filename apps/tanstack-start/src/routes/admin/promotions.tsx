import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Gift, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import {
  formatPerUserRedemptionPolicy,
  generatePromotionCode,
  UNLIMITED_PER_USER_REDEMPTIONS,
} from "@redux/shared";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
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
import { Separator } from "@redux/ui/components/separator";
import { Textarea } from "@redux/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@redux/ui/components/table";

import { formatDate } from "@/components/admin/user-detail/utils";

const PAGE_SIZE = 25;

type PerUserMode = "once" | "limited" | "unlimited";
type PromotionFormType =
  | "app_credits"
  | "subscription_discount"
  | "gifted_subscription"
  | "stripe_invoice_credit";
type SubscriptionDuration = "once" | "repeating" | "forever";
type DiscountType = "percent" | "amount";

export const Route = createFileRoute("/admin/promotions")({
  head: () => ({
    meta: [{ title: "Promotions | Admin | Redux Chat" }],
  }),
  component: AdminPromotionsPage,
});

function parseDate(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function storedPerUserLimit(mode: PerUserMode, limit: string) {
  if (mode === "once") return undefined;
  if (mode === "unlimited") return UNLIMITED_PER_USER_REDEMPTIONS;
  const parsed = Number(limit);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isPerUserMode(value: string | null): value is PerUserMode {
  return value === "once" || value === "limited" || value === "unlimited";
}

function isPromotionFormType(value: string | null): value is PromotionFormType {
  return (
    value === "app_credits" ||
    value === "subscription_discount" ||
    value === "gifted_subscription" ||
    value === "stripe_invoice_credit"
  );
}

function isSubscriptionDuration(
  value: string | null,
): value is SubscriptionDuration {
  return value === "once" || value === "repeating" || value === "forever";
}

function isDiscountType(value: string | null): value is DiscountType {
  return value === "percent" || value === "amount";
}

const promotionTypeRadioTileClass =
  "flex min-w-[11rem] flex-1 cursor-pointer gap-3 rounded-lg border bg-card/50 p-3.5 text-left shadow-sm outline-none transition-colors hover:bg-accent/35 focus-visible:ring-[3px] focus-visible:ring-ring/55 [&:has([data-checked])]:border-primary [&:has([data-checked])]:bg-primary/5";

const perUserRadioTileClass =
  "flex min-h-[4.25rem] min-w-[7.75rem] flex-1 cursor-pointer gap-3 rounded-lg border bg-card/50 p-3 text-left shadow-sm outline-none transition-colors hover:bg-accent/35 focus-visible:ring-[3px] focus-visible:ring-ring/55 [&:has([data-checked])]:border-primary [&:has([data-checked])]:bg-primary/5";

/** Parse a USD dollar amount string (e.g. "25.32") to integer cents. */
function usdDollarsStringToCents(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  const cents = Math.round(dollars * 100);
  return cents > 0 ? cents : null;
}

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

function CreatePromotionDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(() => generatePromotionCode());
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [promotionType, setPromotionType] =
    useState<PromotionFormType>("app_credits");
  const [amount, setAmount] = useState("");
  const [invoiceCreditUsd, setInvoiceCreditUsd] = useState("");
  const [targetTier, setTargetTier] = useState<"plus" | "pro">("plus");
  const [targetTierMode, setTargetTierMode] = useState<"all" | "plus" | "pro">(
    "all",
  );
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [percentOff, setPercentOff] = useState("");
  const [amountOffCents, setAmountOffCents] = useState("");
  const [duration, setDuration] = useState<SubscriptionDuration>("once");
  const [durationMonths, setDurationMonths] = useState("3");
  const [maxRedemptions, setMaxRedemptions] = useState("");
  const [perUserMode, setPerUserMode] = useState<PerUserMode>("once");
  const [perUserLimit, setPerUserLimit] = useState("2");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const createPromotion = useMutation(api.functions.promotions.adminCreatePromotion);

  const reset = () => {
    setCode(generatePromotionCode());
    setName("");
    setDescription("");
    setPromotionType("app_credits");
    setAmount("");
    setInvoiceCreditUsd("");
    setTargetTier("plus");
    setTargetTierMode("all");
    setDiscountType("percent");
    setPercentOff("");
    setAmountOffCents("");
    setDuration("once");
    setDurationMonths("3");
    setMaxRedemptions("");
    setPerUserMode("once");
    setPerUserLimit("2");
    setStartsAt("");
    setEndsAt("");
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
    const max = maxRedemptions.trim() === "" ? undefined : Number(maxRedemptions);
    const perUserRedemptionLimit = storedPerUserLimit(
      perUserMode,
      perUserLimit,
    );
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

    const kind =
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
      await createPromotion({
        code,
        name,
        description: description.trim() || undefined,
        kind,
        status: "active",
        maxRedemptions: max,
        perUserRedemptionLimit,
        startsAt: parseDate(startsAt),
        endsAt: parseDate(endsAt),
        config,
      });
      toast.success("Promotion created");
      reset();
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create promotion.",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" />}>
        <Plus className="size-4" />
        Create
      </DialogTrigger>
      <DialogContent
        className="flex max-h-[min(92vh,840px)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-border/60 shrink-0 space-y-1.5 border-b px-6 pt-6 pb-4">
          <DialogTitle>Create promotion</DialogTitle>
          <DialogDescription>
            Codes are case-insensitive once saved. Leave schedule fields empty
            for no start or end bound; leave the global cap blank for unlimited
            total redemptions (subject to per-user rules below).
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
                  <Label htmlFor="promotion-code">Code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="promotion-code"
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
                  <Label htmlFor="promotion-name">Name</Label>
                  <Input
                    id="promotion-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Launch gift"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="promotion-description">Description</Label>
                  <Textarea
                    id="promotion-description"
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Internal campaign note (optional)"
                  />
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
                    if (isPromotionFormType(value)) {
                      setPromotionType(value);
                    }
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
                  <Label htmlFor="promotion-credits">Gifted credits</Label>
                  <Input
                    id="promotion-credits"
                    type="number"
                    min={1}
                    step={1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="100000"
                  />
                  <p className="text-muted-foreground text-xs">
                    Whole credits added to wallet balance immediately on
                    successful redemption.
                  </p>
                </div>
              ) : null}

              {promotionType === "stripe_invoice_credit" ? (
                <div className="border-border/80 bg-muted/15 grid gap-2 rounded-xl border px-4 py-3">
                  <Label htmlFor="promotion-invoice-credit">
                    Invoice credit (USD)
                  </Label>
                  <Input
                    id="promotion-invoice-credit"
                    type="number"
                    min={0}
                    step="0.01"
                    value={invoiceCreditUsd}
                    onChange={(e) => setInvoiceCreditUsd(e.target.value)}
                    placeholder="25.32"
                  />
                  <p className="text-muted-foreground text-xs">
                    Enter dollars with decimals if needed. This is converted to
                    cents for Stripe (e.g.{" "}
                    <span className="font-mono text-[0.6875rem]">25.32</span> →{" "}
                    <span className="font-mono text-[0.6875rem]">2532</span>{" "}
                    cents) as customer balance toward future invoices.
                  </p>
                </div>
              ) : null}

              {promotionType === "subscription_discount" ||
              promotionType === "gifted_subscription" ? (
                <div className="border-border/80 bg-muted/15 grid gap-5 rounded-xl border px-4 py-4">
                  <p className="text-muted-foreground text-xs leading-relaxed">
                    Subscription promotions create or extend a Stripe price.
                    Gifted tiers bill at 100% discount; paid discounts honor
                    the percent or cents you set.
                  </p>
                  <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                <div className="grid min-w-0 gap-2">
                  <Label>Default tier</Label>
                  <Select
                    value={targetTier}
                        onValueChange={(value) => {
                          if (value === "plus" || value === "pro") {
                            setTargetTier(value);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="plus">Plus</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                  </Select>
                </div>
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
                        if (value === "plus" || value === "pro") {
                          setTargetTier(value);
                        }
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
                  </div>

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
                        <Label htmlFor="promotion-discount-value">
                          {discountType === "percent"
                            ? "Percent off"
                            : "Amount (cents USD)"}
                        </Label>
                        <Input
                          id="promotion-discount-value"
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
                          placeholder={discountType === "percent" ? "25" : "500"}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                    <div className="grid min-w-0 gap-2">
                      <Label>Billing cadence discount</Label>
                      <Select
                        value={duration}
                        onValueChange={(value) => {
                          if (isSubscriptionDuration(value)) setDuration(value);
                        }}
                      >
                        <SelectTrigger className="w-full min-w-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="once">First invoice only</SelectItem>
                          <SelectItem value="repeating">
                            Repeat for N months
                          </SelectItem>
                          <SelectItem value="forever">All invoices</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid min-w-0 gap-2">
                      <Label htmlFor="promotion-duration-months">Months</Label>
                      <Input
                        id="promotion-duration-months"
                        type="number"
                        min={1}
                        step={1}
                        disabled={duration !== "repeating"}
                        value={durationMonths}
                        onChange={(e) => setDurationMonths(e.target.value)}
                        className="w-full max-w-32"
                      />
                    </div>
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
                      if (isPerUserMode(value)) {
                        setPerUserMode(value);
                      }
                    }}
                    aria-label="Per-user redemption policy"
                  >
                    <Label className={perUserRadioTileClass}>
                      <RadioGroupItem value="once" />
                      <span className="min-w-0 flex-1 leading-snug">
                        <span className="block text-sm font-medium">Once</span>
                        <span className="text-muted-foreground block text-xs font-normal">
                          Single use per login
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
                      <Label htmlFor="promotion-per-user-cap">
                        Cap per customer
                      </Label>
                      <Input
                        id="promotion-per-user-cap"
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
                  <Label htmlFor="promotion-max">Total redemptions (global)</Label>
                  <Input
                    id="promotion-max"
                    type="number"
                    min={1}
                    step={1}
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    placeholder="Unlimited across all users"
                  />
                  <p className="text-muted-foreground text-xs">
                    Optional hard stop after this many successes across everyone.
                  </p>
                </div>
              </div>
            </FormSection>

            <Separator />

            <FormSection
              title="Validity window"
              description="Both fields are optional — blank start means redeemable immediately; blank end runs until manually paused."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="promotion-start">Starts (local)</Label>
                  <Input
                    id="promotion-start"
                    type="datetime-local"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="promotion-end">Ends (local)</Label>
                  <Input
                    id="promotion-end"
                    type="datetime-local"
                    value={endsAt}
                    onChange={(e) => setEndsAt(e.target.value)}
                  />
                </div>
              </div>
            </FormSection>
          </div>
        </div>

        <DialogFooter className="border-border/60 bg-background/95 shrink-0 border-t px-6 py-4 backdrop-blur-sm supports-backdrop-filter:bg-background/80">
          <DialogClose render={<Button type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button type="button" onClick={() => void submit()}>
            Create promotion
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdminPromotionsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.promotions.adminListPromotions,
    { search: activeSearch || undefined },
    { initialNumItems: PAGE_SIZE },
  );

  const promotions = useMemo(() => results, [results]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            Promotions
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Create codes, control repeat redemption, and track usage.
          </p>
        </div>
        <CreatePromotionDialog />
      </div>

      <div className="flex gap-2">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name or code"
          onKeyDown={(e) => {
            if (e.key === "Enter") setActiveSearch(searchInput.trim());
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setActiveSearch(searchInput.trim())}
        >
          <Search className="size-4" />
          Search
        </Button>
      </div>

      <div className="border-border/70 bg-card/60 overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Per user</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground h-28 text-center"
                >
                  <Gift className="mx-auto mb-2 size-5" />
                  No promotions found.
                </TableCell>
              </TableRow>
            ) : (
              promotions.map((promotion) => (
                <TableRow key={promotion.promotionId}>
                  <TableCell className="font-mono text-xs">
                    {promotion.code}
                  </TableCell>
                  <TableCell className="font-medium">
                    {promotion.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{promotion.kind}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{promotion.status}</Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {promotion.redeemedCount.toLocaleString()}
                    {promotion.maxRedemptions
                      ? ` / ${promotion.maxRedemptions.toLocaleString()}`
                      : ""}
                  </TableCell>
                  <TableCell>
                    {formatPerUserRedemptionPolicy(
                      promotion.perUserRedemptionLimit,
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(promotion.startsAt)} -{" "}
                    {formatDate(promotion.endsAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      render={
                        <Link
                          to="/admin/promotions/$promotionId"
                          params={{ promotionId: promotion.promotionId }}
                        />
                      }
                    >
                      Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {status === "CanLoadMore" ? (
        <Button type="button" variant="outline" onClick={() => loadMore(PAGE_SIZE)}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
