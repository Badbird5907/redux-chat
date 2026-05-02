import { Polar as PolarSdkClient } from "@polar-sh/sdk";

import {
  DEFAULT_BILLING_CONFIG,
  aggregateBillableToolCalls,
  getPlanConfig,
  resolveModelRoute,
} from "@redux/shared";
import type {
  BillableToolCall,
  PlanTier,
  UsageChargeComputationResult,
} from "@redux/shared";

type BillingUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
};

import { backendEnv } from "./env";

type BillingSubscriptionSnapshot = {
  productId?: string;
  productKey?: string;
  status?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  customerId?: string;
  subscriptionId?: string;
};

export const BILLING_DEBUG_LOGGING = false;

/** Checkpoint / trace logs; enable only by flipping `BILLING_DEBUG_LOGGING` locally. */
export function billingDebugLog(
  ...args: Parameters<typeof console.log>
): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- BILLING_DEBUG_LOGGING gate
  if (BILLING_DEBUG_LOGGING) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- delegated to console
    console.log(...args);
  }
}

/** Diagnostic warnings (e.g. missing pricing); gated like `billingDebugLog`. */
export function billingDebugWarn(
  ...args: Parameters<typeof console.warn>
): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- BILLING_DEBUG_LOGGING gate
  if (BILLING_DEBUG_LOGGING) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- delegated to console
    console.warn(...args);
  }
}

export type BillingGrantReason =
  | "subscription_created"
  | "subscription_renewed"
  | "free_monthly_reset"
  | "admin_adjustment";

export type BillingGrantSource =
  | "subscription_renewal"
  | "free_monthly_reset"
  | "admin_adjustment";

export const POLAR_CREDITS_EVENT_NAME = "credits";

export function getBillingConfig() {
  const env = backendEnv();
  return {
    ...DEFAULT_BILLING_CONFIG,
    meterName:
      env.POLAR_CREDITS_METER_NAME,
  };
}

export function getPolarSdkClient() {
  const env = backendEnv();
  if (!env.POLAR_ACCESS_TOKEN) {
    throw new Error("POLAR_ACCESS_TOKEN is not set");
  }

  return new PolarSdkClient({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: env.POLAR_SERVER,
  });
}

export function getBillingPeriodKey(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getUtcMonthBounds(timestamp = Date.now()) {
  const date = new Date(timestamp);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0);
  const end = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return {
    start,
    end,
  };
}

export function resolveTierFromSubscription(
  subscription: BillingSubscriptionSnapshot | null | undefined,
) {
  if (!subscription) {
    return "free" satisfies PlanTier;
  }

  const env = backendEnv();

  if (subscription.productKey === "pro") {
    return "pro" satisfies PlanTier;
  }

  if (subscription.productKey === "plus") {
    return "plus" satisfies PlanTier;
  }

  if (subscription.productId && subscription.productId === env.POLAR_PRO_PRODUCT_ID) {
    return "pro" satisfies PlanTier;
  }

  if (
    subscription.productId &&
    subscription.productId === env.POLAR_PLUS_PRODUCT_ID
  ) {
    return "plus" satisfies PlanTier;
  }

  return "free" satisfies PlanTier;
}

export function toSubscriptionSnapshot(
  subscription: unknown,
): BillingSubscriptionSnapshot | null {
  if (!subscription || typeof subscription !== "object") {
    return null;
  }

  const value = subscription as Record<string, unknown>;

  return {
    productId:
      typeof value.productId === "string"
        ? value.productId
        : typeof value.product_id === "string"
          ? value.product_id
          : undefined,
    productKey:
      typeof value.productKey === "string" ? value.productKey : undefined,
    status: typeof value.status === "string" ? value.status : undefined,
    currentPeriodStart: toTimestamp(value.currentPeriodStart),
    currentPeriodEnd: toTimestamp(value.currentPeriodEnd),
    customerId:
      typeof value.customerId === "string" ? value.customerId : undefined,
    subscriptionId:
      typeof value.id === "string"
        ? value.id
        : typeof value.subscriptionId === "string"
          ? value.subscriptionId
          : undefined,
  };
}

export function buildBillingAccountRecord(
  userId: string,
  subscription: BillingSubscriptionSnapshot | null,
): {
  userId: string;
  tier: PlanTier;
  status: string;
  polarCustomerId: string | undefined;
  polarSubscriptionId: string | undefined;
  currentPeriodStart: number | undefined;
  currentPeriodEnd: number | undefined;
  markupMultiplier: number;
  includedMonthlyCredits: number;
  overageAllowed: boolean;
  updatedAt: number;
} {
  const tier = resolveTierFromSubscription(subscription);
  const plan = getPlanConfig(tier, getBillingConfig());

  return {
    userId,
    tier,
    status: subscription?.status ?? "inactive",
    polarCustomerId: subscription?.customerId,
    polarSubscriptionId: subscription?.subscriptionId,
    currentPeriodStart: subscription?.currentPeriodStart,
    currentPeriodEnd: subscription?.currentPeriodEnd,
    markupMultiplier: plan.markupMultiplier,
    includedMonthlyCredits: plan.includedMonthlyCredits,
    overageAllowed: plan.overageAllowed,
    updatedAt: Date.now(),
  };
}

export function buildToolSummaryRecord(
  toolCalls: BillableToolCall[] | undefined,
) {
  return Object.fromEntries(aggregateBillableToolCalls(toolCalls).entries());
}

export function buildPolarCreditUsageEvent(args: {
  userId: string;
  requestId: string;
  messageId: string;
  threadId: string;
  routeId: string;
  tier: PlanTier;
  charge: UsageChargeComputationResult;
  usage: BillingUsage;
  toolCalls?: BillableToolCall[];
}) {
  const toolSummary = buildToolSummaryRecord(args.toolCalls);
  const llmMetadata = buildPolarLlmMetadata({
    routeId: args.routeId,
    usage: args.usage,
  });

  return {
    name: POLAR_CREDITS_EVENT_NAME,
    externalCustomerId: args.userId,
    metadata: {
      units: args.charge.credits,
      requestId: args.requestId,
      messageId: args.messageId,
      threadId: args.threadId,
      routeId: args.routeId,
      tier: args.tier,
      modelUsdCost: args.charge.modelUsdCost,
      toolUsdCost: args.charge.toolUsdCost,
      rawUsdCost: args.charge.rawUsdCost,
      markupMultiplier: args.charge.markupMultiplier,
      effectiveUsdCost: args.charge.effectiveUsdCost,
      displayMultiplier: args.charge.displayMultiplier,
      usedPricingFallback: args.charge.usedPricingFallback,
      toolSummaryJson: JSON.stringify(toolSummary),
      _cost: {
        amount: args.charge.rawUsdCost,
        currency: "usd",
      },
      _llm: llmMetadata,
    },
  };
}

/**
 * Build the special `_llm` metadata block consumed by the Polar UI to surface
 * top-models and per-event LLM stats. See:
 * https://docs.polar.sh/features/usage-based-billing/ingestion-strategies/llm-strategy
 */
export function buildPolarLlmMetadata(args: {
  routeId: string;
  usage: BillingUsage;
}) {
  const route = resolveModelRoute(args.routeId);
  const inputTokens = args.usage.inputTokens ?? 0;
  const outputTokens = args.usage.outputTokens ?? 0;
  const reasoningTokens = args.usage.reasoningTokens ?? 0;
  const cachedInputTokens = args.usage.cacheReadTokens ?? 0;
  // Polar requires `outputTokens` and `totalTokens`; treat reasoning as
  // output for billing purposes so totals match what providers report.
  const totalOutputTokens = outputTokens + reasoningTokens;
  const totalTokens =
    inputTokens +
    totalOutputTokens +
    cachedInputTokens +
    (args.usage.cacheWriteTokens ?? 0) +
    (args.usage.inputAudioTokens ?? 0) +
    (args.usage.outputAudioTokens ?? 0);

  // Fall back to parsing `provider:model` from the routeId when the route is
  // not registered (e.g. fallback pricing path). routeId is `${provider}:${model}`.
  const [fallbackProvider, ...fallbackModelParts] = args.routeId.split(":");
  const fallbackModel = fallbackModelParts.join(":");

  const vendor = getPolarLlmVendor({
    canonicalModelId: route?.canonicalModelId,
    provider: route?.provider ?? fallbackProvider,
    vendorId: route?.vendorId ?? fallbackModel,
  });
  const model =
    route?.canonicalModelId ??
    (fallbackModel.length > 0 ? fallbackModel : route?.displayName ?? args.routeId);

  // The SDK expects camelCase here; it serializes to snake_case on the wire.
  return {
    vendor,
    model,
    inputTokens,
    outputTokens: totalOutputTokens,
    totalTokens,
    cachedInputTokens,
  };
}

function getPolarLlmVendor(args: {
  canonicalModelId?: string;
  provider?: string;
  vendorId?: string;
}): string {
  const canonicalVendor = getModelOwnerPrefix(args.canonicalModelId);
  if (canonicalVendor) {
    return canonicalVendor;
  }

  const providerModelVendor = getModelOwnerPrefix(args.vendorId);
  if (providerModelVendor) {
    return normalizeProviderVendor(providerModelVendor) ?? providerModelVendor;
  }

  return normalizeProviderVendor(args.provider) ?? "unknown";
}

function getModelOwnerPrefix(modelId: string | undefined) {
  if (!modelId) {
    return undefined;
  }

  const [owner] = modelId.split("/");
  return owner && owner !== modelId ? owner : undefined;
}

function normalizeProviderVendor(provider: string | undefined) {
  if (!provider) {
    return undefined;
  }

  if (provider === "vertex") {
    return "google";
  }

  return provider;
}

export function buildPolarCreditGrantEvent(args: {
  userId: string;
  credits: number;
  tier: PlanTier;
  periodKey: string;
  reason: BillingGrantReason;
  source: BillingGrantSource;
}) {
  return {
    name: POLAR_CREDITS_EVENT_NAME,
    externalCustomerId: args.userId,
    metadata: {
      units: -Math.abs(args.credits),
      reason: args.reason,
      tier: args.tier,
      periodKey: args.periodKey,
      source: args.source,
    },
  };
}

export function extractMeterBalance(
  state: unknown,
  meterName: string,
): number | undefined {
  return extractMeterCreditSummary(state, meterName).availableCredits;
}

export function extractMeterCreditSummary(
  state: unknown,
  meterName: string,
) {
  if (!state || typeof state !== "object") {
    return { availableCredits: undefined, overageCredits: undefined };
  }

  const activeMeters = (state as { activeMeters?: unknown }).activeMeters;
  if (!Array.isArray(activeMeters)) {
    return { availableCredits: undefined, overageCredits: undefined };
  }

  const normalizedMeters = activeMeters.flatMap((meter) => {
    if (!meter || typeof meter !== "object") {
      return [];
    }

    const candidate = meter as Record<string, unknown>;
    const candidateName =
      typeof candidate.name === "string"
        ? candidate.name
        : candidate.meter &&
            typeof candidate.meter === "object" &&
            "name" in candidate.meter &&
            typeof (candidate.meter as { name?: unknown }).name === "string"
          ? (candidate.meter as { name: string }).name
          : undefined;
    const balance =
      typeof candidate.balance === "number" ? candidate.balance : undefined;
    const consumedUnits =
      typeof candidate.consumedUnits === "number"
        ? candidate.consumedUnits
        : undefined;

    return [
      {
        candidateName,
        balance,
        consumedUnits,
      },
    ];
  });

  const matchingMeter =
    normalizedMeters.find((meter) => meter.candidateName === meterName) ??
    (normalizedMeters.length === 1 ? normalizedMeters[0] : undefined);

  if (matchingMeter) {
    const { availableCredits, overageCredits } =
      deriveMeterCreditSummary(matchingMeter);

    billingDebugLog("billing_extract_meter_balance_match", {
      meterName,
      candidateName: matchingMeter.candidateName,
      balance: matchingMeter.balance,
      consumedUnits: matchingMeter.consumedUnits,
      availableCredits,
      overageCredits,
      usedSingleMeterFallback:
        matchingMeter.candidateName === undefined && normalizedMeters.length === 1,
    });

    return { availableCredits, overageCredits };
  }

  billingDebugWarn("billing_extract_meter_balance_missing_meter", {
    meterName,
    activeMeters: normalizedMeters,
  });

  return { availableCredits: undefined, overageCredits: undefined };
}

function deriveMeterCreditSummary(meter: {
  balance?: number;
  consumedUnits?: number;
}) {
  if (typeof meter.consumedUnits === "number" && meter.consumedUnits > 0) {
    return {
      availableCredits: 0,
      overageCredits:
        typeof meter.balance === "number" && meter.balance > 0
          ? Math.max(meter.balance, meter.consumedUnits)
          : meter.consumedUnits,
    };
  }

  if (typeof meter.consumedUnits === "number" && meter.consumedUnits <= 0) {
    return {
      availableCredits: Math.abs(meter.consumedUnits),
      overageCredits: 0,
    };
  }

  if (typeof meter.balance === "number" && meter.balance >= 0) {
    return {
      availableCredits: meter.balance,
      overageCredits: 0,
    };
  }

  if (typeof meter.balance === "number") {
    return {
      availableCredits: Math.max(0, -meter.balance),
      overageCredits: meter.balance > 0 ? meter.balance : 0,
    };
  }

  return { availableCredits: undefined, overageCredits: undefined };
}

function toTimestamp(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  return undefined;
}
