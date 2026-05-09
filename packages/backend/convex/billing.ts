import { Polar as PolarSdkClient } from "@polar-sh/sdk";

import type {
  BillableToolCall,
  PlanTier,
  UsageChargeComputationResult,
} from "@redux/shared";
import {
  aggregateBillableToolCalls,
  DEFAULT_BILLING_CONFIG,
  getPlanConfig,
  resolveModelRoute,
} from "@redux/shared";

import { backendEnv } from "./env";

type BillingUsage = {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
};

type BillingSubscriptionSnapshot = {
  productId?: string;
  productKey?: string;
  status?: string;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  customerId?: string;
  subscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
};

/** Fields only Polar’s live subscription API exposes (Convex Polar DB omits pending updates). */
export type BillingSubscriptionSchedule = {
  cancelAtPeriodEnd: boolean;
  pendingProductId: string | undefined;
  pendingAppliesAtMs: number | undefined;
};

export const BILLING_DEBUG_LOGGING = false;

/** Diagnostic warnings (e.g. missing pricing); gated like `BILLING_DEBUG_LOGGING`. */
export function billingDebugWarn(
  ...args: Parameters<typeof console.warn>
): void {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- BILLING_DEBUG_LOGGING gate
  if (BILLING_DEBUG_LOGGING) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- delegated to console
    console.warn(...args);
  }
}

export const POLAR_CREDITS_EVENT_NAME = "credits";

/**
 * Polar's API rejects decimal inputs with more than 17 total digits (Pydantic
 * `decimal_max_digits`). Floating-point arithmetic on USD costs routinely
 * produces trailing-precision noise like `0.0011797500000000002` (19 digits)
 * which trips the validator. Rounding to 12 decimal places gives sub-pico-USD
 * precision — far more than billing needs — while staying safely under the
 * 17-digit ceiling for any plausible per-event amount.
 */
const POLAR_DECIMAL_MAX_DIGITS = 12;

export function toPolarSafeAmount(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  // `Number(x.toFixed(n))` collapses representational noise by re-parsing the
  // rounded string, so the resulting JSON serialization stays within the
  // digit budget Polar enforces.
  return Number(value.toFixed(POLAR_DECIMAL_MAX_DIGITS));
}

export function getBillingConfig() {
  return DEFAULT_BILLING_CONFIG;
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
  const start = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    1,
    0,
    0,
    0,
    0,
  );
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

  if (subscription.productKey === "free") {
    return "free" satisfies PlanTier;
  }

  if (
    subscription.productId &&
    subscription.productId === env.POLAR_PRO_PRODUCT_ID
  ) {
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

  const cancelAtPeriodEnd =
    typeof value.cancelAtPeriodEnd === "boolean"
      ? value.cancelAtPeriodEnd
      : typeof value.cancel_at_period_end === "boolean"
        ? value.cancel_at_period_end
        : undefined;

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
    cancelAtPeriodEnd,
  };
}

export function subscriptionScheduleFromPolarSdkSubscription(
  subscription: unknown,
): BillingSubscriptionSchedule {
  if (!subscription || typeof subscription !== "object") {
    return {
      cancelAtPeriodEnd: false,
      pendingProductId: undefined,
      pendingAppliesAtMs: undefined,
    };
  }

  const value = subscription as Record<string, unknown>;
  const cancelAtPeriodEnd =
    typeof value.cancelAtPeriodEnd === "boolean"
      ? value.cancelAtPeriodEnd
      : typeof value.cancel_at_period_end === "boolean"
        ? value.cancel_at_period_end
        : false;

  const pendingRaw = value.pendingUpdate ?? value.pending_update;
  let pendingProductId: string | undefined;
  let pendingAppliesAtMs: number | undefined;

  if (pendingRaw && typeof pendingRaw === "object") {
    const pending = pendingRaw as Record<string, unknown>;
    const pid = pending.productId ?? pending.product_id;
    if (typeof pid === "string") {
      pendingProductId = pid;
    }
    pendingAppliesAtMs = toTimestamp(pending.appliesAt ?? pending.applies_at);
  }

  return { cancelAtPeriodEnd, pendingProductId, pendingAppliesAtMs };
}

export function polarLiveSubscriptionProductId(
  subscription: unknown,
): string | undefined {
  if (!subscription || typeof subscription !== "object") {
    return undefined;
  }
  const value = subscription as Record<string, unknown>;
  const id = value.productId ?? value.product_id;
  return typeof id === "string" ? id : undefined;
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
        // Polar's cost-events API expects the amount in **cents** (integer minor units),
        // not dollars. https://polar.sh/docs/features/cost-insights/cost-events
        // We pass cents as a float to retain sub-cent precision per event since LLM
        // calls routinely cost fractions of a cent. `toPolarSafeAmount` then clamps
        // decimal-precision noise so Polar's 17-digit decimal validator accepts it.
        amount: toPolarSafeAmount(args.charge.rawUsdCost * 100),
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
    (fallbackModel.length > 0
      ? fallbackModel
      : (route?.displayName ?? args.routeId));

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

function toTimestamp(value: unknown) {
  if (typeof value === "number") {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }

  return undefined;
}
