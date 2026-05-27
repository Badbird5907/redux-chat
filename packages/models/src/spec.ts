import type { ProviderCatalogMap } from "./catalog";
import type {
  ModelContextLimits,
  ModelKnowledgeCutoff,
  ModelModalities,
  ModelPricing,
  ModelsDevModelCost,
  ModelsDevModelRecord,
  ModelSpec,
  ModelSupports,
} from "./types";
import { getProviderModel } from "./catalog";

export function getModelSpec(
  providers: ProviderCatalogMap,
  routeId: string,
): ModelSpec | undefined {
  const resolved = getProviderModel(providers, routeId);
  if (!resolved) {
    return undefined;
  }

  return {
    id: routeId as ModelSpec["id"],
    provider: resolved.provider.id,
    providerName: resolved.provider.name,
    vendorId: resolved.vendorId,
    displayName: resolved.model.name,
    pricing: toPricing(resolved.model.cost),
    pricingMetadata: resolved.model.cost,
    context: toContext(resolved.model),
    modalities: toModalities(resolved.model),
    supports: toSupports(resolved.model),
    source: resolved.provider.doc,
    knowledgeCutoff: toKnowledgeCutoff(resolved.model.knowledge),
    releasedAt: resolved.model.release_date,
    verifiedAt: resolved.model.last_updated,
  };
}

export function toPricing(cost: ModelsDevModelCost | undefined): ModelPricing {
  const outputPrice = numberOrUndefined(cost?.output);

  return {
    input: numberOrUndefined(cost?.input),
    output: outputPrice,
    // When a provider does not publish separate reasoning pricing,
    // bill reasoning tokens at the output-token rate.
    reasoning: numberOrUndefined(cost?.reasoning) ?? outputPrice,
    cacheRead: numberOrUndefined(cost?.cache_read),
    cacheWrite: numberOrUndefined(cost?.cache_write),
    inputAudio: numberOrUndefined(cost?.input_audio),
    outputAudio: numberOrUndefined(cost?.output_audio),
  };
}

export function toContext(model: ModelsDevModelRecord): ModelContextLimits {
  return {
    combinedMax: model.limit?.context,
    inputMax: model.limit?.input,
    outputMax: model.limit?.output,
  };
}

export function toModalities(model: ModelsDevModelRecord): ModelModalities {
  return {
    input: [...(model.modalities?.input ?? [])],
    output: [...(model.modalities?.output ?? [])],
  };
}

export function toSupports(model: ModelsDevModelRecord): ModelSupports {
  const outputModalities = model.modalities?.output ?? [];

  return {
    attachments: model.attachment === true,
    imageGenerationTool: false,
    imageOutput: outputModalities.includes("image"),
    reasoning: model.reasoning === true,
    toolCalling: model.tool_call === true,
    temperature: model.temperature === true,
    structuredOutput: model.structured_output === true,
  };
}

export function toKnowledgeCutoff(
  raw: string | undefined,
): ModelKnowledgeCutoff | undefined {
  if (!raw) {
    return undefined;
  }

  const match = /^(?<year>\d{4})(?:-(?<month>\d{2}))?(?:-(?<day>\d{2}))?$/.exec(
    raw,
  );
  if (!match?.groups?.year) {
    return undefined;
  }

  return {
    raw,
    year: Number(match.groups.year),
    month: match.groups.month ? Number(match.groups.month) : undefined,
    day: match.groups.day ? Number(match.groups.day) : undefined,
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}
