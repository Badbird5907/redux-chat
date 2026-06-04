import type { Dispatch, ReactNode, SetStateAction } from "react";

import type { PlanTier } from "@redux/shared";
import { Checkbox } from "@redux/ui/components/checkbox";
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

import type {
  AppCreditExpiryMode,
  AppCreditPlanEligibilityMode,
  DiscountType,
  PerUserMode,
  SubscriptionDuration,
  TargetTierMode,
} from "./promotion-form-helpers";
import {
  isDiscountType,
  isPerUserMode,
  isSubscriptionDuration,
  perUserRadioTileClass,
} from "./promotion-form-helpers";

export function FormSection({
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

export function AppCreditsConfigFields({
  mode,
  amount,
  setAmount,
  planEligibilityMode,
  setPlanEligibilityMode,
  selectedPlanTiers,
  setSelectedPlanTiers,
  expiryMode,
  setExpiryMode,
  expiryDays,
  setExpiryDays,
  expiryDate,
  setExpiryDate,
}: {
  mode: "create" | "edit";
  amount: string;
  setAmount: Dispatch<SetStateAction<string>>;
  planEligibilityMode: AppCreditPlanEligibilityMode;
  setPlanEligibilityMode: Dispatch<
    SetStateAction<AppCreditPlanEligibilityMode>
  >;
  selectedPlanTiers: PlanTier[];
  setSelectedPlanTiers: Dispatch<SetStateAction<PlanTier[]>>;
  expiryMode: AppCreditExpiryMode;
  setExpiryMode: Dispatch<SetStateAction<AppCreditExpiryMode>>;
  expiryDays: string;
  setExpiryDays: Dispatch<SetStateAction<string>>;
  expiryDate: string;
  setExpiryDate: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="border-border/80 bg-muted/15 grid gap-4 rounded-xl border px-4 py-3">
      <Label htmlFor={`promotion-credits-${mode}`}>Gifted credits</Label>
      <Input
        id={`promotion-credits-${mode}`}
        type="number"
        min={1}
        step={1}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="100000"
      />
      <div className="grid gap-2">
        <Label>Eligible plans</Label>
        <RadioGroup
          value={planEligibilityMode}
          onValueChange={(next) => {
            const value = typeof next === "string" ? next : "";
            if (value === "all" || value === "selected") {
              setPlanEligibilityMode(value);
            }
          }}
          aria-label="Gifted credit eligible plans"
        >
          <Label className={perUserRadioTileClass}>
            <RadioGroupItem value="all" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-sm font-medium">Any plan</span>
              <span className="text-muted-foreground block text-xs font-normal">
                Free, Plus, and Pro users can redeem
              </span>
            </span>
          </Label>
          <Label className={perUserRadioTileClass}>
            <RadioGroupItem value="selected" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-sm font-medium">Selected plans</span>
              <span className="text-muted-foreground block text-xs font-normal">
                Restrict redemption by current plan
              </span>
            </span>
          </Label>
        </RadioGroup>
        {planEligibilityMode === "selected" ? (
          <div className="bg-card/50 grid gap-2 rounded-lg border p-3">
            {(["free", "plus", "pro"] satisfies PlanTier[]).map((tier) => (
              <Label key={tier} className="flex items-center gap-3 text-sm">
                <Checkbox
                  checked={selectedPlanTiers.includes(tier)}
                  onCheckedChange={(checked) => {
                    setSelectedPlanTiers((current) =>
                      checked === true
                        ? [...new Set([...current, tier])]
                        : current.filter((currentTier) => currentTier !== tier),
                    );
                  }}
                />
                <span className="capitalize">{tier}</span>
              </Label>
            ))}
          </div>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label>Credit expiration</Label>
        <RadioGroup
          value={expiryMode}
          onValueChange={(next) => {
            const value = typeof next === "string" ? next : "";
            if (
              value === "never" ||
              value === "after_days" ||
              value === "fixed_date"
            ) {
              setExpiryMode(value);
            }
          }}
          aria-label="Gifted credit expiration policy"
        >
          <Label className={perUserRadioTileClass}>
            <RadioGroupItem value="never" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-sm font-medium">Never expire</span>
              <span className="text-muted-foreground block text-xs font-normal">
                Credits remain until spent
              </span>
            </span>
          </Label>
          <Label className={perUserRadioTileClass}>
            <RadioGroupItem value="after_days" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-sm font-medium">
                Expire after days
              </span>
              <span className="text-muted-foreground block text-xs font-normal">
                X days from the moment of redemption
              </span>
            </span>
          </Label>
          <Label className={perUserRadioTileClass}>
            <RadioGroupItem value="fixed_date" />
            <span className="min-w-0 flex-1 leading-snug">
              <span className="block text-sm font-medium">Expire on date</span>
              <span className="text-muted-foreground block text-xs font-normal">
                All grants expire on the same fixed date
              </span>
            </span>
          </Label>
        </RadioGroup>
        {expiryMode === "after_days" ? (
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor={`promotion-credit-expiry-days-${mode}`}>
              Days after redemption
            </Label>
            <Input
              id={`promotion-credit-expiry-days-${mode}`}
              type="number"
              min={1}
              step={1}
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              placeholder="30"
            />
          </div>
        ) : null}
        {expiryMode === "fixed_date" ? (
          <div className="grid gap-2 sm:max-w-xs">
            <Label htmlFor={`promotion-credit-expiry-date-${mode}`}>
              Expiration date (local)
            </Label>
            <Input
              id={`promotion-credit-expiry-date-${mode}`}
              type="datetime-local"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function SubscriptionConfigFields({
  mode,
  promotionType,
  targetTierMode,
  setTargetTierMode,
  freeUsersOnly,
  setFreeUsersOnly,
  discountType,
  setDiscountType,
  percentOff,
  setPercentOff,
  amountOffCents,
  setAmountOffCents,
  duration,
  setDuration,
  durationMonths,
  setDurationMonths,
}: {
  mode: "create" | "edit";
  promotionType: "subscription_discount" | "gifted_subscription";
  targetTierMode: TargetTierMode;
  setTargetTierMode: Dispatch<SetStateAction<TargetTierMode>>;
  freeUsersOnly: boolean;
  setFreeUsersOnly: Dispatch<SetStateAction<boolean>>;
  discountType: DiscountType;
  setDiscountType: Dispatch<SetStateAction<DiscountType>>;
  percentOff: string;
  setPercentOff: Dispatch<SetStateAction<string>>;
  amountOffCents: string;
  setAmountOffCents: Dispatch<SetStateAction<string>>;
  duration: SubscriptionDuration;
  setDuration: Dispatch<SetStateAction<SubscriptionDuration>>;
  durationMonths: string;
  setDurationMonths: Dispatch<SetStateAction<string>>;
}) {
  return (
    <div className="border-border/80 bg-muted/15 grid gap-5 rounded-xl border p-4">
      <div className="grid min-w-0 gap-2">
        <Label>Promotion applies to</Label>
        <Select
          value={targetTierMode}
          onValueChange={(value) => {
            if (value === "all" || value === "plus" || value === "pro") {
              setTargetTierMode(value);
            }
          }}
        >
          <SelectTrigger className="w-full min-w-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All paid subscription tiers</SelectItem>
            <SelectItem value="plus">Plus only</SelectItem>
            <SelectItem value="pro">Pro only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Label className="bg-card/50 flex items-start gap-3 rounded-lg border p-3">
        <Checkbox
          checked={freeUsersOnly}
          onCheckedChange={(checked) => setFreeUsersOnly(checked === true)}
          className="mt-0.5"
        />
        <span className="grid gap-1">
          <span className="text-sm font-medium">Free users only</span>
          <span className="text-muted-foreground text-xs font-normal">
            When disabled, existing paid subscribers can claim same-tier
            full-discount promos as free subscription time.
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
              value={discountType === "percent" ? percentOff : amountOffCents}
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
              <SelectItem value="once">First invoice only</SelectItem>
              <SelectItem value="repeating">A set number of months</SelectItem>
              <SelectItem value="forever">Forever</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {duration === "repeating" ? (
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={`promotion-duration-months-${mode}`}>Months</Label>
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
  );
}

export function RedemptionLimitsFields({
  mode,
  perUserMode,
  setPerUserMode,
  perUserLimit,
  setPerUserLimit,
  maxRedemptions,
  setMaxRedemptions,
  pauseOnRedemptionLimit,
  setPauseOnRedemptionLimit,
}: {
  mode: "create" | "edit";
  perUserMode: PerUserMode;
  setPerUserMode: Dispatch<SetStateAction<PerUserMode>>;
  perUserLimit: string;
  setPerUserLimit: Dispatch<SetStateAction<string>>;
  maxRedemptions: string;
  setMaxRedemptions: Dispatch<SetStateAction<string>>;
  pauseOnRedemptionLimit: boolean;
  setPauseOnRedemptionLimit: Dispatch<SetStateAction<boolean>>;
}) {
  return (
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
                <span className="block text-sm font-medium">Limited</span>
                <span className="text-muted-foreground block text-xs font-normal">
                  Cap repeat redemptions
                </span>
              </span>
            </Label>
            <Label className={perUserRadioTileClass}>
              <RadioGroupItem value="unlimited" />
              <span className="min-w-0 flex-1 leading-snug">
                <span className="block text-sm font-medium">Unlimited</span>
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

        <Label className="bg-card/50 flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            checked={pauseOnRedemptionLimit}
            onCheckedChange={(checked) =>
              setPauseOnRedemptionLimit(checked === true)
            }
            className="mt-0.5"
          />
          <span className="grid gap-1">
            <span className="text-sm font-medium">
              Pause instead of archive when limit is hit
            </span>
            <span className="text-muted-foreground text-xs font-normal">
              By default, the promotion is auto-archived once total redemptions
              reach the global cap. Enable to pause it instead so it can be
              resumed later.
            </span>
          </span>
        </Label>
      </div>
    </FormSection>
  );
}
