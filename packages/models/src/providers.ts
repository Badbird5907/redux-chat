import { anthropicModels } from "./generated/anthropic";
import { googleModels } from "./generated/google";
import { openaiModels } from "./generated/openai";
import { openrouterModels } from "./generated/openrouter";
import { generatedProviderManifest } from "./generated/manifest";

import type { ModelsDevProviderCatalog } from "./types";

export const MODELS_DEV_PROVIDERS = {
  anthropic: anthropicModels,
  google: googleModels,
  openai: openaiModels,
  openrouter: openrouterModels,
} satisfies Record<string, ModelsDevProviderCatalog>;

export const MODELS_DEV_PROVIDER_IDS = Object.keys(MODELS_DEV_PROVIDERS);
export { generatedProviderManifest };
