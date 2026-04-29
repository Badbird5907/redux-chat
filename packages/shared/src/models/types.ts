export type CanonicalModelId = `${string}/${string}`;
export type ModelProviderRouteId = `${string}:${string}`;
export type AllowedMimeType = string;

export interface ModelKnowledgeCutoff {
  raw: string;
  year: number;
  month?: number;
  day?: number;
}

export interface ModelPricing {
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface ModelSupports {
  attachments: boolean;
  reasoning: boolean;
  toolCalling: boolean;
  temperature: boolean;
  structuredOutput: boolean;
}

export interface ModelContextLimits {
  combinedMax?: number;
  inputMax?: number;
  outputMax?: number;
}

export interface ModelModalities {
  input: string[];
  output: string[];
}

export interface ModelProviderInfo {
  id: string;
  name: string;
  api?: string;
  doc: string;
  env: readonly string[];
  routeIds: ModelProviderRouteId[];
  modelIds: CanonicalModelId[];
}

export interface ModelRouteInfo {
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
  canonicalModelId?: CanonicalModelId;
}

export interface ChatModelBenchmarks {
  aa: {
    id?: string;
    slug?: string;
  };
  [key: string]: unknown;
}

export interface CuratedAttachmentOverride {
  maxFiles?: number;
  extraAccept?: string[];
  extraMimeTypes?: string[];
}

export interface CuratedModelDefinition {
  id: string;
  providerIds: ModelProviderRouteId[];
  defaultProviderId?: ModelProviderRouteId;
  name?: string;
  benchmarks?: ChatModelBenchmarks;
  attachments?: CuratedAttachmentOverride;
  custom?: Record<string, unknown>;
}

export interface CuratedProviderBenchmarks {
  aa: { // artificialanalysis
    id?: string;
    slug?: string;
  }
  aaSlug?: string;
}

export interface CuratedProviderDefinition {
  slug: string;
  name: string;
  benchmarks?: CuratedProviderBenchmarks;
  models: readonly CuratedModelDefinition[];
}

export interface CanonicalCuratedModelDefinition extends CuratedModelDefinition {
  id: CanonicalModelId;
  providerSlug: string;
  providerName: string;
  providerBenchmarks?: CuratedProviderBenchmarks;
}

export interface ChatModelConfig {
  id: CanonicalModelId;
  name: string;
  maker: string;
  provider: string;
  providerIds: ModelProviderRouteId[];
  defaultProviderId: ModelProviderRouteId;
  accept: string[];
  allowedMimeTypes: AllowedMimeType[];
  maxFiles?: number;
  knowledgeCutoff?: ModelKnowledgeCutoff;
  supports: ModelSupports;
  costs: ModelPricing;
  context: ModelContextLimits;
  modalities: ModelModalities;
  benchmarks?: ChatModelBenchmarks;
  custom?: Record<string, unknown>;
}
