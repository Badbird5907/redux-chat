import { useMemo, useState } from "react";
import { useAction } from "convex/react";
import { CreditCard } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import {
  calculatePurchasedCreditsFromCents,
  MAX_CREDIT_TOP_UP_USD_CENTS,
  MIN_CREDIT_TOP_UP_USD_CENTS,
} from "@redux/shared";
import { Button } from "@redux/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { Input } from "@redux/ui/components/input";
import { cn } from "@redux/ui/lib/utils";

import { formatNumber } from "@/components/billing/format-number";

type AddCreditsBillingState = {
  tier?: "free" | "plus" | "pro";
};

type AddCreditsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billingState: AddCreditsBillingState | null | undefined;
  triggerContext?: "out_of_credits" | "settings";
};

const PRESET_AMOUNTS = [500, 1_000, 2_500, 5_000] as const;
const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatUsd(cents: number) {
  return usdFormatter.format(cents / 100);
}

function dollarsInputFromCents(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseDollarInputToCents(value: string) {
  const trimmed = value.trim();
  if (!/^\d+(?:\.\d{0,2})?$/.test(trimmed)) {
    return null;
  }

  const [dollarsRaw, centsRaw = ""] = trimmed.split(".");
  const dollars = Number(dollarsRaw);
  const cents = Number(centsRaw.padEnd(2, "0"));
  if (!Number.isSafeInteger(dollars) || !Number.isSafeInteger(cents)) {
    return null;
  }

  return dollars * 100 + cents;
}

export function AddCreditsDialog({
  open,
  onOpenChange,
  billingState,
  triggerContext = "settings",
}: AddCreditsDialogProps) {
  const posthog = usePostHog();
  const createCheckout = useAction(
    api.functions.billing.createCurrentUserCreditTopUpCheckout,
  );
  const [amountInput, setAmountInput] = useState(() =>
    dollarsInputFromCents(MIN_CREDIT_TOP_UP_USD_CENTS),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = useMemo(
    () => parseDollarInputToCents(amountInput),
    [amountInput],
  );
  const credits =
    amountCents !== null && amountCents > 0
      ? calculatePurchasedCreditsFromCents(amountCents)
      : 0;
  const isPaidPlan =
    billingState?.tier === "plus" || billingState?.tier === "pro";
  const amountTooLow =
    amountCents !== null && amountCents < MIN_CREDIT_TOP_UP_USD_CENTS;
  const amountTooHigh =
    amountCents !== null && amountCents > MAX_CREDIT_TOP_UP_USD_CENTS;
  const amountInvalid = amountCents === null || amountTooLow || amountTooHigh;
  const validationMessage =
    amountCents === null
      ? "Enter a valid dollar amount."
      : amountTooLow
        ? `Minimum deposit is ${formatUsd(MIN_CREDIT_TOP_UP_USD_CENTS)}.`
        : amountTooHigh
          ? `Maximum deposit is ${formatUsd(MAX_CREDIT_TOP_UP_USD_CENTS)}.`
          : null;

  const title =
    triggerContext === "out_of_credits"
      ? "Add credits to keep chatting"
      : "Add credits";

  const confirm = async () => {
    if (amountCents === null || amountInvalid || !isPaidPlan) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      posthog.capture("credits_checkout_started", {
        amount_cents: amountCents,
        credits,
        trigger_context: triggerContext,
        tier: billingState.tier,
      });
      const checkout = await createCheckout({ amountCents });
      window.location.assign(checkout.url);
    } catch (checkoutError) {
      const message =
        checkoutError instanceof Error
          ? checkoutError.message
          : "Could not create checkout.";
      setError(message);
      toast.error(message);
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen);
        }
      }}
    >
      <DialogContent showCloseButton={!isSubmitting}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Purchased credits are added to your account and do not expire.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-4 gap-2">
            {PRESET_AMOUNTS.map((preset) => (
              <Button
                key={preset}
                type="button"
                variant={amountCents === preset ? "default" : "outline"}
                size="sm"
                className={cn(
                  "text-xs",
                  amountCents !== preset && "bg-transparent",
                )}
                onClick={() => {
                  setAmountInput(dollarsInputFromCents(preset));
                  setError(null);
                }}
                disabled={isSubmitting}
              >
                {formatUsd(preset)}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            <label
              className="text-sm leading-none font-medium"
              htmlFor="credit-top-up-amount"
            >
              Deposit amount
            </label>
            <Input
              id="credit-top-up-amount"
              inputMode="decimal"
              value={amountInput}
              onChange={(event) => {
                setAmountInput(event.target.value);
                setError(null);
              }}
              disabled={isSubmitting}
              aria-invalid={amountInvalid}
              aria-describedby="credit-top-up-validation"
              placeholder="5.00"
            />
            <p
              id="credit-top-up-validation"
              className={cn(
                "text-xs",
                validationMessage
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {validationMessage ??
                `${formatUsd(MIN_CREDIT_TOP_UP_USD_CENTS)} minimum deposit.`}
            </p>
          </div>

          <div className="bg-muted/35 ring-border grid gap-3 rounded-lg p-4 text-sm ring-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Credits added</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatNumber(credits)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Due today</span>
              <span className="font-mono font-semibold tabular-nums">
                {formatUsd(amountCents ?? 0)}
              </span>
            </div>
          </div>

          {!isPaidPlan ? (
            <p className="text-destructive text-sm" role="alert">
              Credit top-ups are available on paid plans.
            </p>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void confirm()}
            disabled={isSubmitting || amountInvalid || !isPaidPlan}
            className="gap-2"
          >
            <CreditCard className="size-4" aria-hidden />
            {isSubmitting ? "Creating checkout..." : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
