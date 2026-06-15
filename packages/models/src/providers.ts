import type { ModelsDevProviderCatalog } from "./types";
import { anthropicModels } from "./generated/anthropic";
import { googleModels } from "./generated/google";
import { generatedProviderManifest } from "./generated/manifest";
import { openaiModels } from "./generated/openai";
import { openrouterModels } from "./generated/openrouter";
import { vertexModels } from "./generated/vertex";
import { workersaiModels } from "./generated/workersai";

// make sure to check provider-runtime.ts
export const MODELS_DEV_PROVIDERS = {
  anthropic: anthropicModels,
  google: googleModels,
  openai: openaiModels,
  openrouter: openrouterModels,
  vertex: vertexModels,
  workersai: workersaiModels,
} satisfies Record<string, ModelsDevProviderCatalog>;

export const MODELS_DEV_PROVIDER_IDS = Object.keys(MODELS_DEV_PROVIDERS);
export { generatedProviderManifest };
