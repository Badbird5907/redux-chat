import type { Dispatch, SetStateAction } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import type {
  PlanTier,
  PromotionStatus,
  SubscriptionPromotionConfig,
} from "@redux/shared";
import { api } from "@redux/backend/convex/_generated/api";
import { generatePromotionCode } from "@redux/shared";

import type {
  AppCreditExpiryMode,
  AppCreditPlanEligibilityMode,
  DiscountType,
  PerUserMode,
  PromotionFormDialogPromotion,
  PromotionFormType,
  SubscriptionDuration,
  TargetTierMode,
} from "./promotion-form-helpers";
import { useReducerState } from "@/lib/hooks/use-reducer-state";
import {
  appCreditPlanEligibilityModeFromStored,
  appCreditSelectedPlanTiersFromStored,
  buildPromotionConfig,
  formatDateInput,
  metadataConfig,
  objectValue,
  parseDate,
  perUserModeFromStored,
  promotionTypeFromPromotion,
  storedPerUserLimit,
  targetTierModeFromStored,
  validatePromotionForm,
} from "./promotion-form-helpers";

export interface PromotionFormState {
  open: boolean;
  setOpen: Dispatch<SetStateAction<boolean>>;
  submitting: boolean;
  code: string;
  setCode: Dispatch<SetStateAction<string>>;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  description: string;
  setDescription: Dispatch<SetStateAction<string>>;
  status: PromotionStatus;
  setStatus: Dispatch<SetStateAction<PromotionStatus>>;
  promotionType: PromotionFormType;
  setPromotionType: Dispatch<SetStateAction<PromotionFormType>>;
  amount: string;
  setAmount: Dispatch<SetStateAction<string>>;
  appCreditPlanEligibilityMode: AppCreditPlanEligibilityMode;
  setAppCreditPlanEligibilityMode: Dispatch<
    SetStateAction<AppCreditPlanEligibilityMode>
  >;
  appCreditSelectedPlanTiers: PlanTier[];
  setAppCreditSelectedPlanTiers: Dispatch<SetStateAction<PlanTier[]>>;
  appCreditExpiryMode: AppCreditExpiryMode;
  setAppCreditExpiryMode: Dispatch<SetStateAction<AppCreditExpiryMode>>;
  appCreditExpiryDays: string;
  setAppCreditExpiryDays: Dispatch<SetStateAction<string>>;
  appCreditExpiryDate: string;
  setAppCreditExpiryDate: Dispatch<SetStateAction<string>>;
  invoiceCreditUsd: string;
  setInvoiceCreditUsd: Dispatch<SetStateAction<string>>;
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
  maxRedemptions: string;
  setMaxRedemptions: Dispatch<SetStateAction<string>>;
  pauseOnRedemptionLimit: boolean;
  setPauseOnRedemptionLimit: Dispatch<SetStateAction<boolean>>;
  perUserMode: PerUserMode;
  setPerUserMode: Dispatch<SetStateAction<PerUserMode>>;
  perUserLimit: string;
  setPerUserLimit: Dispatch<SetStateAction<string>>;
  startsAt: string;
  setStartsAt: Dispatch<SetStateAction<string>>;
  endsAt: string;
  setEndsAt: Dispatch<SetStateAction<string>>;
  reset: () => void;
  submit: () => Promise<void>;
}

export function usePromotionForm(
  mode: "create" | "edit",
  promotion: PromotionFormDialogPromotion | undefined,
): PromotionFormState {
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
  const initialAppCreditPlanEligibilityMode =
    appCreditPlanEligibilityModeFromStored(config.eligiblePlanTiers);
  const initialAppCreditSelectedPlanTiers =
    appCreditSelectedPlanTiersFromStored(config.eligiblePlanTiers);
  const initialDuration =
    subscriptionDuration.type === "repeating" ||
    subscriptionDuration.type === "forever"
      ? subscriptionDuration.type
      : "once";
  const initialPerUserMode = perUserModeFromStored(
    promotion?.perUserRedemptionLimit,
  );

  const [open, setOpen] = useReducerState(false);
  const [submitting, setSubmitting] = useReducerState(false);
  const [code, setCode] = useReducerState(
    promotion?.code ?? generatePromotionCode(),
  );
  const [name, setName] = useReducerState(promotion?.name ?? "");
  const [description, setDescription] = useReducerState(
    promotion?.description ?? "",
  );
  const [status, setStatus] = useReducerState<PromotionStatus>(
    promotion?.status ?? "active",
  );
  const [promotionType, setPromotionType] =
    useReducerState<PromotionFormType>(initialPromotionType);
  const [amount, setAmount] = useReducerState(
    typeof config.amount === "number" ? config.amount.toString() : "",
  );
  const [appCreditPlanEligibilityMode, setAppCreditPlanEligibilityMode] =
    useReducerState<AppCreditPlanEligibilityMode>(
      initialAppCreditPlanEligibilityMode,
    );
  const [appCreditSelectedPlanTiers, setAppCreditSelectedPlanTiers] =
    useReducerState<PlanTier[]>(initialAppCreditSelectedPlanTiers);
  const [appCreditExpiryMode, setAppCreditExpiryMode] =
    useReducerState<AppCreditExpiryMode>(
      typeof config.expiresAfterDays === "number"
        ? "after_days"
        : typeof config.expiresAt === "number"
          ? "fixed_date"
          : "never",
    );
  const [appCreditExpiryDays, setAppCreditExpiryDays] = useReducerState(
    typeof config.expiresAfterDays === "number"
      ? config.expiresAfterDays.toString()
      : "30",
  );
  const [appCreditExpiryDate, setAppCreditExpiryDate] = useReducerState(() =>
    formatDateInput(
      typeof config.expiresAt === "number" ? config.expiresAt : undefined,
    ),
  );
  const [invoiceCreditUsd, setInvoiceCreditUsd] = useReducerState(
    typeof config.amountCents === "number"
      ? (config.amountCents / 100).toFixed(2)
      : "",
  );
  const [targetTierMode, setTargetTierMode] = useReducerState<TargetTierMode>(
    initialTargetTierMode,
  );
  const [freeUsersOnly, setFreeUsersOnly] = useReducerState(
    subscriptionConfig?.freeUsersOnly !== false,
  );
  const [discountType, setDiscountType] = useReducerState<DiscountType>(
    subscriptionDiscount.type === "amount" ? "amount" : "percent",
  );
  const [percentOff, setPercentOff] = useReducerState(
    typeof subscriptionDiscount.percentOff === "number"
      ? subscriptionDiscount.percentOff.toString()
      : "",
  );
  const [amountOffCents, setAmountOffCents] = useReducerState(
    typeof subscriptionDiscount.amountOffCents === "number"
      ? subscriptionDiscount.amountOffCents.toString()
      : "",
  );
  const [duration, setDuration] =
    useReducerState<SubscriptionDuration>(initialDuration);
  const [durationMonths, setDurationMonths] = useReducerState(
    typeof subscriptionDuration.months === "number"
      ? subscriptionDuration.months.toString()
      : "3",
  );
  const [maxRedemptions, setMaxRedemptions] = useReducerState(
    promotion?.maxRedemptions?.toString() ?? "",
  );
  const [pauseOnRedemptionLimit, setPauseOnRedemptionLimit] = useReducerState(
    promotion?.pauseOnRedemptionLimit === true,
  );
  const [perUserMode, setPerUserMode] =
    useReducerState<PerUserMode>(initialPerUserMode);
  const [perUserLimit, setPerUserLimit] = useReducerState(
    initialPerUserMode === "limited"
      ? (promotion?.perUserRedemptionLimit ?? 2).toString()
      : "2",
  );
  const [startsAt, setStartsAt] = useReducerState(() =>
    formatDateInput(promotion?.startsAt),
  );
  const [endsAt, setEndsAt] = useReducerState(() =>
    formatDateInput(promotion?.endsAt),
  );

  const reset = () => {
    setCode(promotion?.code ?? generatePromotionCode());
    setName(promotion?.name ?? "");
    setDescription(promotion?.description ?? "");
    setStatus(promotion?.status ?? "active");
    setPromotionType(initialPromotionType);
    setAmount(
      typeof config.amount === "number" ? config.amount.toString() : "",
    );
    setAppCreditPlanEligibilityMode(initialAppCreditPlanEligibilityMode);
    setAppCreditSelectedPlanTiers(initialAppCreditSelectedPlanTiers);
    setAppCreditExpiryMode(
      typeof config.expiresAfterDays === "number"
        ? "after_days"
        : typeof config.expiresAt === "number"
          ? "fixed_date"
          : "never",
    );
    setAppCreditExpiryDays(
      typeof config.expiresAfterDays === "number"
        ? config.expiresAfterDays.toString()
        : "30",
    );
    setAppCreditExpiryDate(
      formatDateInput(
        typeof config.expiresAt === "number" ? config.expiresAt : undefined,
      ),
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
    setPauseOnRedemptionLimit(promotion?.pauseOnRedemptionLimit === true);
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
    if (submitting) return;

    const error = validatePromotionForm({
      name,
      promotionType,
      amount,
      appCreditExpiryMode,
      appCreditExpiryDays,
      appCreditExpiryDate,
      appCreditPlanEligibilityMode,
      appCreditSelectedPlanTiers,
      discountType,
      percentOff,
      amountOffCents,
      duration,
      durationMonths,
      maxRedemptions,
      perUserMode,
      perUserLimit,
      startsAt,
      endsAt,
      invoiceCreditUsd,
    });
    if (error) {
      toast.error(error);
      return;
    }

    const { kind, config: builtConfig } = buildPromotionConfig({
      promotionType,
      amount,
      appCreditPlanEligibilityMode,
      appCreditSelectedPlanTiers,
      appCreditExpiryMode,
      appCreditExpiryDays,
      appCreditExpiryDate,
      invoiceCreditUsd,
      freeUsersOnly,
      targetTierMode,
      discountType,
      percentOff,
      amountOffCents,
      duration,
      durationMonths,
    });

    const max =
      maxRedemptions.trim() === "" ? undefined : Number(maxRedemptions);
    const perUserRedemptionLimit = storedPerUserLimit(
      perUserMode,
      perUserLimit,
    );
    const starts = parseDate(startsAt);
    const ends = parseDate(endsAt);

    try {
      setSubmitting(true);
      if (mode === "create") {
        await createPromotion({
          code,
          name,
          description: description.trim() || undefined,
          kind,
          status,
          maxRedemptions: max,
          perUserRedemptionLimit,
          pauseOnRedemptionLimit,
          startsAt: starts,
          endsAt: ends,
          config: builtConfig,
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
          pauseOnRedemptionLimit,
          startsAt: starts ?? null,
          endsAt: ends ?? null,
          config: builtConfig,
        });
        toast.success("Promotion updated");
      }
      reset();
      setOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Failed to ${mode} promotion.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return {
    open,
    setOpen,
    submitting,
    code,
    setCode,
    name,
    setName,
    description,
    setDescription,
    status,
    setStatus,
    promotionType,
    setPromotionType,
    amount,
    setAmount,
    appCreditPlanEligibilityMode,
    setAppCreditPlanEligibilityMode,
    appCreditSelectedPlanTiers,
    setAppCreditSelectedPlanTiers,
    appCreditExpiryMode,
    setAppCreditExpiryMode,
    appCreditExpiryDays,
    setAppCreditExpiryDays,
    appCreditExpiryDate,
    setAppCreditExpiryDate,
    invoiceCreditUsd,
    setInvoiceCreditUsd,
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
    maxRedemptions,
    setMaxRedemptions,
    pauseOnRedemptionLimit,
    setPauseOnRedemptionLimit,
    perUserMode,
    setPerUserMode,
    perUserLimit,
    setPerUserLimit,
    startsAt,
    setStartsAt,
    endsAt,
    setEndsAt,
    reset,
    submit,
  };
}
