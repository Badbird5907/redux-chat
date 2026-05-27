import type { ModelsDevModelCost } from "@redux/models";

export type CanonicalModelId = `${string}/${string}`;
export type ModelProviderRouteId = `${string}:${string}`;
export type ThinkingLevel = "instant" | "low" | "medium" | "high";
export const DEFAULT_THINKING_LEVELS = [
  "instant",
  "low",
  "medium",
  "high",
] as const satisfies readonly ThinkingLevel[];
export type AllowedMimeType = string;
export type ChatAttachmentKind =
  | "image"
  | "pdf"
  | "plain_text"
  | "office_document"
  | "spreadsheet"
  | "presentation";
export type ChatAttachmentDeliveryMode =
  | "native"
  | "inline_text"
  | "convert_to_pdf";

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

export interface ModelSupports {
  attachments: boolean;
  imageGenerationTool: boolean;
  imageOutput: boolean;
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
  npm?: string;
  doc: string;
  env: readonly string[];
  routeIds: ModelProviderRouteId[];
  modelIds: CanonicalModelId[];
}

export interface ChatAttachmentPolicy {
  defaults?: Partial<Record<ChatAttachmentKind, ChatAttachmentDeliveryMode>>;
  overrides?: Partial<Record<string, ChatAttachmentDeliveryMode>>;
}

export interface ModelRouteBehavior {
  runtimeProviderKey?: string;
  attachmentPolicy?: ChatAttachmentPolicy;
  /**
   * When true, routes through this provider use the OpenAI Chat Completions
   * compatible adapter instead of the provider's default SDK. Useful for
   * OpenRouter-hosted models whose streams the default provider cannot parse.
   */
  useOpenAICompatible?: boolean;
}

export interface ModelRouteInfo {
  id: ModelProviderRouteId;
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
  canonicalModelId?: CanonicalModelId;
  behavior: ModelRouteBehavior;
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
  thinkingLevels?: readonly ThinkingLevel[];
  defaultThinkingLevel?: ThinkingLevel;
  benchmarks?: ChatModelBenchmarks;
  attachments?: CuratedAttachmentOverride;
  routeBehavior?: Partial<Record<ModelProviderRouteId, ModelRouteBehavior>>;
  capabilities?: {
    imageGenerationTool?: boolean;
    imageOutput?: boolean;
  };
  custom?: Record<string, unknown>;
}

export interface CuratedProviderBenchmarks {
  aa: {
    // artificialanalysis
    id?: string;
    slug?: string;
  };
  aaSlug?: string;
}

export interface CuratedProviderDefinition {
  slug: string;
  name: string;
  benchmarks?: CuratedProviderBenchmarks;
  /**
   * Defaults applied to every model in this curated provider, keyed by the
   * underlying route provider slug (e.g. "openrouter"). Per-model
   * `routeBehavior` overrides take precedence.
   */
  routeBehavior?: Partial<Record<string, ModelRouteBehavior>>;
  models: readonly CuratedModelDefinition[];
}

export interface CanonicalCuratedModelDefinition extends CuratedModelDefinition {
  id: CanonicalModelId;
  providerSlug: string;
  providerName: string;
  providerBenchmarks?: CuratedProviderBenchmarks;
  providerRouteBehavior?: Partial<Record<string, ModelRouteBehavior>>;
}

export interface ChatModelConfig {
  id: CanonicalModelId;
  name: string;
  maker: string;
  makerName: string;
  provider: string;
  providerIds: ModelProviderRouteId[];
  defaultProviderId: ModelProviderRouteId;
  accept: string[];
  allowedMimeTypes: AllowedMimeType[];
  acceptedChatExtensions: string[];
  acceptedChatMimeTypes: AllowedMimeType[];
  maxFiles?: number;
  thinkingLevels: readonly ThinkingLevel[];
  defaultThinkingLevel?: ThinkingLevel;
  knowledgeCutoff?: ModelKnowledgeCutoff;
  supports: ModelSupports;
  costs: ModelPricing;
  pricingMetadata?: ModelsDevModelCost;
  context: ModelContextLimits;
  modalities: ModelModalities;
  releasedAt?: string;
  verifiedAt?: string;
  benchmarks?: ChatModelBenchmarks;
  custom?: Record<string, unknown>;
}
