export type ModelProviderId = string;
export type ModelId = string;
export type ModelRouteId = `${string}:${string}`;

export interface ModelsDevModelCost {
  input?: number;
  output?: number;
  reasoning?: number;
  cache_read?: number;
  cache_write?: number;
  input_audio?: number;
  output_audio?: number;
  [key: string]: number | undefined | ModelsDevCostTier;
}

export type ModelsDevCostTier = Record<string, number | undefined>;

export interface ModelsDevModelLimit {
  context?: number;
  input?: number;
  output?: number;
}

export interface ModelsDevModalities {
  input?: readonly string[];
  output?: readonly string[];
}

export interface ModelsDevModelRecord {
  id: string;
  name: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  temperature?: boolean;
  knowledge?: string;
  release_date?: string;
  last_updated?: string;
  open_weights?: boolean;
  modalities?: ModelsDevModalities;
  cost?: ModelsDevModelCost;
  limit?: ModelsDevModelLimit;
}

export interface ModelsDevProviderCatalog<
  TModels extends Record<string, ModelsDevModelRecord> = Record<
    string,
    ModelsDevModelRecord
  >,
> {
  id: string;
  name: string;
  api?: string;
  npm?: string;
  doc: string;
  env: readonly string[];
  models: TModels;
}

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
  inputAudio?: number;
  outputAudio?: number;
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

export interface ModelSupports {
  attachments: boolean;
  reasoning: boolean;
  toolCalling: boolean;
  temperature: boolean;
  structuredOutput: boolean;
}

export interface ModelSpec {
  id: ModelRouteId;
  provider: string;
  providerName: string;
  vendorId: string;
  displayName: string;
  pricing: ModelPricing;
  pricingMetadata?: ModelsDevModelCost;
  context: ModelContextLimits;
  modalities: ModelModalities;
  supports: ModelSupports;
  source: string;
  knowledgeCutoff?: ModelKnowledgeCutoff;
  releasedAt?: string;
  verifiedAt?: string;
}

export interface ModelCostBreakdown {
  inputCost: number;
  outputCost: number;
  reasoningCost: number;
  cacheReadCost: number;
  cacheWriteCost: number;
  inputAudioCost: number;
  outputAudioCost: number;
  totalCost: number;
  missingPrices: (keyof ModelPricing)[];
}

export interface ModelCostComputationInput {
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  inputAudioTokens?: number;
  outputAudioTokens?: number;
}
