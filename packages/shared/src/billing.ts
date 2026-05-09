import type { ModelCostComputationInput } from "@redux/models";

import {
  calculateModelCost,
  DEFAULT_CHAT_MODEL_ID,
  getModelRoute,
  resolveModelRoute,
} from "./models";

export const PLAN_TIERS = ["free", "plus", "pro"] as const;

export type PlanTier = (typeof PLAN_TIERS)[number];

/**
 * Credit buckets are spendable lots categorized by source/policy. Allocation
 * order is determined by the numeric `priority` field — lower values are
 * consumed first, so for example `gifted` (10) drains before `paid` (40).
 *
 * Ordering rationale:
 * - `gifted`: promo / admin grants, often time-limited; consume first so they
 *   don't go to waste.
 * - `monthly`: recurring plan allowance for the current tier (free/plus/pro);
 *   expires at period end so it should be used before non-expiring lots.
 * - `paid`: prepaid one-time purchases; long-lived, so spent last.
 */
export const CREDIT_BUCKETS = {
  gifted: {
    priority: 10,
    label: "Gifted",
    description: "Promotional credits",
  },
  monthly: {
    priority: 20,
    label: "Monthly",
    description: "Recurring plan credits",
  },
  paid: {
    priority: 30,
    label: "Purchased",
    description: "One-time purchased credits",
  },
} as const;

export type CreditBucket = keyof typeof CREDIT_BUCKETS;

export type CreditGrantSource =
  | "polar_subscription_renewal"
  | "polar_one_time_purchase"
  | "free_monthly_reset"
  | "admin_grant"
  | "migration_backfill";

export interface CreditBalance {
  spendableCredits: number;
  bucketBalances: Record<CreditBucket, number>;
  expiringSoon: {
    bucket: CreditBucket;
    grantId: string;
    remaining: number;
    expiresAt: number;
  }[];
}

export interface UserBillingState extends Pick<
  CreditBalance,
  "spendableCredits" | "bucketBalances" | "expiringSoon"
> {
  tier: PlanTier;
  markupMultiplier: number;
  includedMonthlyCredits: number;
  overageAllowed: boolean;
  currentPeriodStart: number | undefined;
  currentPeriodEnd: number | undefined;
  url: string | undefined;
}

export const CREDIT_BUCKET_NAMES = Object.keys(
  CREDIT_BUCKETS,
) as CreditBucket[];

/**
 * Stable bucket allocation order. Lower priority numbers go first, ties
 * broken alphabetically. Use `getCreditBucketAllocationOrder()` rather
 * than relying on object key insertion order.
 */
export function getCreditBucketAllocationOrder(): CreditBucket[] {
  return [...CREDIT_BUCKET_NAMES].sort((a, b) => {
    const diff = CREDIT_BUCKETS[a].priority - CREDIT_BUCKETS[b].priority;
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
}

export type ToolBillingKey = string;

export interface PlanConfig {
  tier: PlanTier;
  includedMonthlyCredits: number;
  markupMultiplier: number;
  overageAllowed: boolean;
  allowedModelIds?: string[];
}

export interface ToolBillingConfig {
  rawUsdPerCall: number;
  enabled: boolean;
}

export interface BillableToolCall {
  billingKey: ToolBillingKey;
  invocationCount: number;
}

export interface UsageChargeComputationInput {
  routeId: string;
  usage: ModelCostComputationInput;
  toolCalls?: BillableToolCall[];
  tier: PlanTier;
}

export interface UsageChargeComputationResult {
  modelUsdCost: number;
  toolUsdCost: number;
  rawUsdCost: number;
  markupMultiplier: number;
  effectiveUsdCost: number;
  credits: number;
  displayMultiplier: number;
  usedPricingFallback: boolean;
}

export interface BillingConfig {
  creditUsdValue: number;
  baselineRouteId: string;
  plans: Record<PlanTier, PlanConfig>;
  tools: Record<string, ToolBillingConfig>;
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  // One credit corresponds to $0.000005 of effective usage value.
  // This is intentionally generous so users can get meaningful volume
  // from low and mid-priced models.
  creditUsdValue: 0.000005,
  baselineRouteId: DEFAULT_CHAT_MODEL_ID,
  plans: {
    free: {
      tier: "free",
      includedMonthlyCredits: 25_000,
      markupMultiplier: 2,
      overageAllowed: false,
    },
    plus: {
      tier: "plus",
      includedMonthlyCredits: 250_000,
      markupMultiplier: 1.5,
      overageAllowed: true,
    },
    pro: {
      tier: "pro",
      includedMonthlyCredits: 1_000_000,
      markupMultiplier: 1.25,
      overageAllowed: true,
    },
  },
  tools: {
    search: {
      rawUsdPerCall: 0.007,
      enabled: true,
    },
    analysis_workspace: {
      rawUsdPerCall: 0.02,
      enabled: true,
    },
    search_project_knowledge: {
      rawUsdPerCall: 0,
      enabled: true,
    },
  },
};

const DISPLAY_MULTIPLIER_BANDS = [1, 2, 4, 8, 16] as const;

export function getPlanConfig(
  tier: PlanTier,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
) {
  return config.plans[tier];
}

export function getToolBillingConfig(
  billingKey: string,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
): ToolBillingConfig {
  if (billingKey.startsWith("mcp:")) {
    return {
      rawUsdPerCall: 0,
      enabled: true,
    };
  }

  return (
    config.tools[billingKey] ?? {
      rawUsdPerCall: 0,
      enabled: true,
    }
  );
}

export function calculateToolUsdCost(
  toolCalls: BillableToolCall[] | undefined,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
): number {
  if (!toolCalls || toolCalls.length === 0) {
    return 0;
  }

  return toolCalls.reduce((total, toolCall) => {
    const toolConfig = getToolBillingConfig(toolCall.billingKey, config);
    if (!toolConfig.enabled || toolCall.invocationCount <= 0) {
      return total;
    }

    return total + toolConfig.rawUsdPerCall * toolCall.invocationCount;
  }, 0);
}

export function calculateCreditsFromUsd(
  rawUsdCost: number,
  markupMultiplier: number,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
) {
  if (rawUsdCost <= 0) {
    return 0;
  }

  return Math.ceil((rawUsdCost * markupMultiplier) / config.creditUsdValue);
}

export function calculateFallbackFourXCharge(
  usage: ModelCostComputationInput,
  markupMultiplier: number,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
) {
  const tokenEquivalent = getUsageTokenEquivalent(usage);
  const credits = tokenEquivalent > 0 ? Math.ceil(tokenEquivalent * 4) : 0;
  const effectiveUsdCost = credits * config.creditUsdValue;
  const rawUsdCost =
    markupMultiplier > 0 ? effectiveUsdCost / markupMultiplier : 0;

  return {
    credits,
    rawUsdCost,
    effectiveUsdCost,
    displayMultiplier: 4,
  };
}

export function calculateDisplayMultiplier(
  routeId: string,
  _tier: PlanTier,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
) {
  const route = getModelRoute(routeId) ?? resolveModelRoute(routeId);
  if (!route) {
    return 4;
  }

  const representativePricePerMillion = getRepresentativePricePerMillion(route);
  if (representativePricePerMillion === undefined) {
    return 4;
  }

  const baselineRoute =
    getModelRoute(config.baselineRouteId) ??
    resolveModelRoute(config.baselineRouteId);
  const baselineRepresentativePricePerMillion = baselineRoute
    ? getRepresentativePricePerMillion(baselineRoute)
    : undefined;

  if (
    typeof baselineRepresentativePricePerMillion !== "number" ||
    baselineRepresentativePricePerMillion <= 0
  ) {
    return 4;
  }

  // Display multipliers should be relative to a baseline model class, not to
  // the credit/USD exchange rate. This keeps cheap models near 1x and makes
  // the badge a simple comparative UX hint rather than a billing formula.
  const ratio =
    representativePricePerMillion / baselineRepresentativePricePerMillion;
  if (!Number.isFinite(ratio) || ratio <= 1) {
    return 1;
  }

  if (ratio <= 1.5) return 1;
  if (ratio <= 3) return 2;
  if (ratio <= 6) return 4;
  if (ratio <= 12) return 8;
  return 16;
}

export function calculateUsageCharge(
  input: UsageChargeComputationInput,
  config: BillingConfig = DEFAULT_BILLING_CONFIG,
): UsageChargeComputationResult {
  const plan = getPlanConfig(input.tier, config);
  const route =
    getModelRoute(input.routeId) ?? resolveModelRoute(input.routeId);
  const toolUsdCost = calculateToolUsdCost(input.toolCalls, config);

  if (!route) {
    const fallback = calculateFallbackFourXCharge(
      input.usage,
      plan.markupMultiplier,
      config,
    );
    const rawUsdCost = fallback.rawUsdCost + toolUsdCost;
    const effectiveUsdCost = rawUsdCost * plan.markupMultiplier;

    return {
      modelUsdCost: fallback.rawUsdCost,
      toolUsdCost,
      rawUsdCost,
      effectiveUsdCost,
      markupMultiplier: plan.markupMultiplier,
      credits: Math.ceil(effectiveUsdCost / config.creditUsdValue),
      displayMultiplier: fallback.displayMultiplier,
      usedPricingFallback: true,
    };
  }

  const modelCost = calculateModelCost(route.pricing, input.usage);
  if (requiresPricingFallback(input.usage, modelCost.missingPrices)) {
    const fallback = calculateFallbackFourXCharge(
      input.usage,
      plan.markupMultiplier,
      config,
    );
    const rawUsdCost = fallback.rawUsdCost + toolUsdCost;
    const effectiveUsdCost = rawUsdCost * plan.markupMultiplier;

    return {
      modelUsdCost: fallback.rawUsdCost,
      toolUsdCost,
      rawUsdCost,
      effectiveUsdCost,
      markupMultiplier: plan.markupMultiplier,
      credits: Math.ceil(effectiveUsdCost / config.creditUsdValue),
      displayMultiplier: fallback.displayMultiplier,
      usedPricingFallback: true,
    };
  }

  const rawUsdCost = modelCost.totalCost + toolUsdCost;
  const effectiveUsdCost = rawUsdCost * plan.markupMultiplier;

  return {
    modelUsdCost: modelCost.totalCost,
    toolUsdCost,
    rawUsdCost,
    effectiveUsdCost,
    markupMultiplier: plan.markupMultiplier,
    credits: Math.ceil(effectiveUsdCost / config.creditUsdValue),
    displayMultiplier: calculateDisplayMultiplier(input.routeId, input.tier),
    usedPricingFallback: false,
  };
}

export function getUsageTokenEquivalent(usage: ModelCostComputationInput) {
  return (
    (usage.inputTokens ?? 0) +
    (usage.outputTokens ?? 0) +
    (usage.reasoningTokens ?? 0) +
    (usage.cacheReadTokens ?? 0) +
    (usage.cacheWriteTokens ?? 0) +
    (usage.inputAudioTokens ?? 0) +
    (usage.outputAudioTokens ?? 0)
  );
}

function requiresPricingFallback(
  usage: ModelCostComputationInput,
  missingPrices: string[],
) {
  if (missingPrices.length === 0) {
    return false;
  }

  const usageByPriceKey: Record<string, number | undefined> = {
    input: usage.inputTokens,
    output: usage.outputTokens,
    reasoning: usage.reasoningTokens,
    cacheRead: usage.cacheReadTokens,
    cacheWrite: usage.cacheWriteTokens,
    inputAudio: usage.inputAudioTokens,
    outputAudio: usage.outputAudioTokens,
  };

  return missingPrices.some((priceKey) => (usageByPriceKey[priceKey] ?? 0) > 0);
}

function getRepresentativePricePerMillion(
  route: NonNullable<ReturnType<typeof getModelRoute>>,
) {
  const values = [
    route.pricing.output,
    route.pricing.reasoning,
    route.pricing.input,
    route.pricing.cacheWrite,
    route.pricing.cacheRead,
    route.pricing.inputAudio,
    route.pricing.outputAudio,
  ].filter((value): value is number => typeof value === "number" && value > 0);

  return values.length > 0 ? Math.max(...values) : undefined;
}

export function aggregateBillableToolCalls(
  toolCalls: BillableToolCall[] | undefined,
) {
  const counts = new Map<string, number>();

  for (const toolCall of toolCalls ?? []) {
    if (toolCall.invocationCount <= 0) {
      continue;
    }

    counts.set(
      toolCall.billingKey,
      (counts.get(toolCall.billingKey) ?? 0) + toolCall.invocationCount,
    );
  }

  return counts;
}

export function getRoundedMultiplierLabel(multiplier: number) {
  const normalized = DISPLAY_MULTIPLIER_BANDS.includes(
    multiplier as (typeof DISPLAY_MULTIPLIER_BANDS)[number],
  )
    ? multiplier
    : multiplier > 12
      ? 16
      : multiplier > 6
        ? 8
        : multiplier > 3
          ? 4
          : multiplier > 1.5
            ? 2
            : 1;

  return `${normalized}x`;
}
