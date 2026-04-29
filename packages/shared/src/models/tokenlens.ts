import { anthropicModels } from "@tokenlens/models/anthropic";
import { googleModels } from "@tokenlens/models/google";
import { openaiModels } from "@tokenlens/models/openai";
import { openrouterModels } from "@tokenlens/models/openrouter";

import type {
  ModelContextLimits,
  ModelKnowledgeCutoff,
  ModelModalities,
  ModelPricing,
  ModelProviderRouteId,
  ModelSupports,
} from "./types";

interface TokenLensModelRecord { // from models.dev
  id: string;
  name: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  modalities?: {
    input?: readonly string[];
    output?: readonly string[];
  };
  cost?: {
    input?: number;
    output?: number;
    reasoning?: number;
    cache_read?: number;
    cache_write?: number;
  };
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
}

interface TokenLensProviderCatalog {
  id: string;
  name: string;
  api?: string;
  doc: string;
  env: readonly string[];
  models: Record<string, TokenLensModelRecord>;
}

export const TOKENLENS_PROVIDERS: Record<string, TokenLensProviderCatalog> = {
  anthropic: anthropicModels,
  google: googleModels,
  openai: openaiModels,
  openrouter: openrouterModels,
};

export function parseRouteId(modelRouteId: string): {
  provider: string;
  vendorId: string;
} | undefined {
  const separatorIndex = modelRouteId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === modelRouteId.length - 1) {
    return undefined;
  }

  return {
    provider: modelRouteId.slice(0, separatorIndex),
    vendorId: modelRouteId.slice(separatorIndex + 1),
  };
}

export function getTokenLensProvider(providerId: string) {
  return TOKENLENS_PROVIDERS[providerId];
}

export function createModelRouteInfo(
  routeId: ModelProviderRouteId,
): {
  id: ModelProviderRouteId;
  provider: string;
  providerName: string;
  vendorId: string;
  displayName: string;
  pricing: ModelPricing;
  context: ModelContextLimits;
  modalities: ModelModalities;
  supports: ModelSupports;
  source: string;
  knowledgeCutoff?: ModelKnowledgeCutoff;
  releasedAt?: string;
  verifiedAt?: string;
} | undefined {
  const parsed = parseRouteId(routeId);
  if (!parsed) {
    return undefined;
  }

  const provider = TOKENLENS_PROVIDERS[parsed.provider];
  const model = provider?.models[parsed.vendorId];
  if (!provider || !model) {
    return undefined;
  }

  return {
    id: routeId,
    provider: provider.id,
    providerName: provider.name,
    vendorId: parsed.vendorId,
    displayName: model.name,
    pricing: toPricing(model),
    context: toContext(model),
    modalities: toModalities(model),
    supports: toSupports(model),
    source: provider.doc,
    knowledgeCutoff: toKnowledgeCutoff(model.knowledge),
    releasedAt: model.release_date,
    verifiedAt: model.last_updated,
  };
}

function toPricing(model: TokenLensModelRecord): ModelPricing {
  return {
    input: model.cost?.input,
    output: model.cost?.output,
    reasoning: model.cost?.reasoning,
    cacheRead: model.cost?.cache_read,
    cacheWrite: model.cost?.cache_write,
  };
}

function toContext(model: TokenLensModelRecord): ModelContextLimits {
  return {
    combinedMax: model.limit?.context,
    inputMax: model.limit?.input,
    outputMax: model.limit?.output,
  };
}

function toModalities(model: TokenLensModelRecord): ModelModalities {
  return {
    input: [...(model.modalities?.input ?? [])],
    output: [...(model.modalities?.output ?? [])],
  };
}

function toSupports(model: TokenLensModelRecord): ModelSupports {
  return {
    attachments: model.attachment === true,
    reasoning: model.reasoning === true,
    toolCalling: model.tool_call === true,
    temperature: model.temperature === true,
    structuredOutput: model.structured_output === true,
  };
}

function toKnowledgeCutoff(
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
