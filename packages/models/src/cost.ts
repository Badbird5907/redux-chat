import type { ProviderCatalogMap } from "./catalog";
import type {
  ModelCostBreakdown,
  ModelCostComputationInput,
  ModelPricing,
} from "./types";
import { getModelSpec } from "./spec";

// models.dev pricing is expressed in USD per 1M tokens/audio tokens.
const TOKEN_UNIT = 1_000_000;

export function calculateModelCost(
  pricing: ModelPricing,
  usage: ModelCostComputationInput,
): ModelCostBreakdown {
  const missingPrices: (keyof ModelPricing)[] = [];

  const inputCost = computeUsageCost(
    usage.inputTokens,
    pricing.input,
    "input",
    missingPrices,
  );
  const outputCost = computeUsageCost(
    usage.outputTokens,
    pricing.output,
    "output",
    missingPrices,
  );
  const reasoningCost = computeUsageCost(
    usage.reasoningTokens,
    pricing.reasoning,
    "reasoning",
    missingPrices,
  );
  const cacheReadCost = computeUsageCost(
    usage.cacheReadTokens,
    pricing.cacheRead,
    "cacheRead",
    missingPrices,
  );
  const cacheWriteCost = computeUsageCost(
    usage.cacheWriteTokens,
    pricing.cacheWrite,
    "cacheWrite",
    missingPrices,
  );
  const inputAudioCost = computeUsageCost(
    usage.inputAudioTokens,
    pricing.inputAudio,
    "inputAudio",
    missingPrices,
  );
  const outputAudioCost = computeUsageCost(
    usage.outputAudioTokens,
    pricing.outputAudio,
    "outputAudio",
    missingPrices,
  );

  return {
    inputCost,
    outputCost,
    reasoningCost,
    cacheReadCost,
    cacheWriteCost,
    inputAudioCost,
    outputAudioCost,
    totalCost:
      inputCost +
      outputCost +
      reasoningCost +
      cacheReadCost +
      cacheWriteCost +
      inputAudioCost +
      outputAudioCost,
    missingPrices,
  };
}

export function calculateModelCostFromUsage(
  pricing: ModelPricing,
  usage: ModelCostComputationInput,
): number {
  return calculateModelCost(pricing, usage).totalCost;
}

export function calculateModelRouteCost(
  providers: ProviderCatalogMap,
  routeId: string,
  usage: ModelCostComputationInput,
): ModelCostBreakdown | undefined {
  const spec = getModelSpec(providers, routeId);
  return spec ? calculateModelCost(spec.pricing, usage) : undefined;
}

export function calculateModelRouteCostFromUsage(
  providers: ProviderCatalogMap,
  routeId: string,
  usage: ModelCostComputationInput,
): number | undefined {
  return calculateModelRouteCost(providers, routeId, usage)?.totalCost;
}

function computeUsageCost(
  tokens: number | undefined,
  pricePerMillion: number | undefined,
  priceKey: keyof ModelPricing,
  missingPrices: (keyof ModelPricing)[],
): number {
  if (!tokens) {
    return 0;
  }

  if (typeof pricePerMillion !== "number") {
    missingPrices.push(priceKey);
    return 0;
  }

  return (tokens / TOKEN_UNIT) * pricePerMillion;
}
