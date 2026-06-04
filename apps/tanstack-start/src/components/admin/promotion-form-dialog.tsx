import { Pencil, Plus } from "lucide-react";

import { generatePromotionCode } from "@redux/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Separator } from "@redux/ui/components/separator";
import { Textarea } from "@redux/ui/components/textarea";

import type { PromotionFormDialogPromotion } from "./promotion-form-helpers";
import {
  AppCreditsConfigFields,
  FormSection,
  RedemptionLimitsFields,
  SubscriptionConfigFields,
} from "./promotion-form-fields";
import {
  isPromotionFormType,
  isPromotionStatus,
  PROMOTION_TYPE_OPTIONS,
  promotionTypeRadioTileClass,
} from "./promotion-form-helpers";
import { usePromotionForm } from "./use-promotion-form";

export type { PromotionFormDialogPromotion };

export function PromotionFormDialog({
  mode,
  promotion,
}: {
  mode: "create" | "edit";
  promotion?: PromotionFormDialogPromotion;
}) {
  const f = usePromotionForm(mode, promotion);

  return (
    <Dialog
      open={f.open}
      onOpenChange={(next) => {
        if (next) f.reset();
        f.setOpen(next);
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

        <div className="min-h-0 flex-1 overflow-y-auto p-6">
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
                      value={f.code}
                      onChange={(e) => f.setCode(e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => f.setCode(generatePromotionCode())}
                    >
                      Generate
                    </Button>
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`promotion-name-${mode}`}>Name</Label>
                  <Input
                    id={`promotion-name-${mode}`}
                    value={f.name}
                    onChange={(e) => f.setName(e.target.value)}
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
                    value={f.description}
                    onChange={(e) => f.setDescription(e.target.value)}
                    placeholder="Internal campaign note (optional)"
                  />
                </div>
                <div className="grid gap-2 sm:max-w-xs">
                  <Label>Status</Label>
                  <Select
                    value={f.status}
                    onValueChange={(value) => {
                      if (isPromotionStatus(value)) f.setStatus(value);
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
                  value={f.promotionType}
                  onValueChange={(next) => {
                    const value = typeof next === "string" ? next : "";
                    if (isPromotionFormType(value)) f.setPromotionType(value);
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

              {f.promotionType === "app_credits" ? (
                <AppCreditsConfigFields
                  mode={mode}
                  amount={f.amount}
                  setAmount={f.setAmount}
                  planEligibilityMode={f.appCreditPlanEligibilityMode}
                  setPlanEligibilityMode={f.setAppCreditPlanEligibilityMode}
                  selectedPlanTiers={f.appCreditSelectedPlanTiers}
                  setSelectedPlanTiers={f.setAppCreditSelectedPlanTiers}
                  expiryMode={f.appCreditExpiryMode}
                  setExpiryMode={f.setAppCreditExpiryMode}
                  expiryDays={f.appCreditExpiryDays}
                  setExpiryDays={f.setAppCreditExpiryDays}
                  expiryDate={f.appCreditExpiryDate}
                  setExpiryDate={f.setAppCreditExpiryDate}
                />
              ) : null}

              {f.promotionType === "stripe_invoice_credit" ? (
                <div className="border-border/80 bg-muted/15 grid gap-2 rounded-xl border px-4 py-3">
                  <Label htmlFor={`promotion-invoice-credit-${mode}`}>
                    Invoice credit (USD)
                  </Label>
                  <Input
                    id={`promotion-invoice-credit-${mode}`}
                    type="number"
                    min={0}
                    step="0.01"
                    value={f.invoiceCreditUsd}
                    onChange={(e) => f.setInvoiceCreditUsd(e.target.value)}
                    placeholder="25.32"
                  />
                </div>
              ) : null}

              {f.promotionType === "subscription_discount" ||
              f.promotionType === "gifted_subscription" ? (
                <SubscriptionConfigFields
                  mode={mode}
                  promotionType={f.promotionType}
                  targetTierMode={f.targetTierMode}
                  setTargetTierMode={f.setTargetTierMode}
                  freeUsersOnly={f.freeUsersOnly}
                  setFreeUsersOnly={f.setFreeUsersOnly}
                  discountType={f.discountType}
                  setDiscountType={f.setDiscountType}
                  percentOff={f.percentOff}
                  setPercentOff={f.setPercentOff}
                  amountOffCents={f.amountOffCents}
                  setAmountOffCents={f.setAmountOffCents}
                  duration={f.duration}
                  setDuration={f.setDuration}
                  durationMonths={f.durationMonths}
                  setDurationMonths={f.setDurationMonths}
                />
              ) : null}
            </FormSection>

            <Separator />

            <RedemptionLimitsFields
              mode={mode}
              perUserMode={f.perUserMode}
              setPerUserMode={f.setPerUserMode}
              perUserLimit={f.perUserLimit}
              setPerUserLimit={f.setPerUserLimit}
              maxRedemptions={f.maxRedemptions}
              setMaxRedemptions={f.setMaxRedemptions}
              pauseOnRedemptionLimit={f.pauseOnRedemptionLimit}
              setPauseOnRedemptionLimit={f.setPauseOnRedemptionLimit}
            />

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
                    value={f.startsAt}
                    onChange={(e) => f.setStartsAt(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`promotion-end-${mode}`}>Ends (local)</Label>
                  <Input
                    id={`promotion-end-${mode}`}
                    type="datetime-local"
                    value={f.endsAt}
                    onChange={(e) => f.setEndsAt(e.target.value)}
                  />
                </div>
              </div>
            </FormSection>
          </div>
        </div>

        <DialogFooter className="border-border/60 bg-background/95 supports-backdrop-filter:bg-background/80 shrink-0 border-t px-6 py-4 backdrop-blur-sm">
          <DialogClose
            render={<Button type="button" variant="outline" />}
            disabled={f.submitting}
          >
            Cancel
          </DialogClose>
          <Button
            type="button"
            onClick={() => void f.submit()}
            disabled={f.submitting}
          >
            {mode === "create" ? "Create promotion" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
