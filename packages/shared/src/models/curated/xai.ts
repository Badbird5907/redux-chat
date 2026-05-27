import type { CuratedProviderDefinition } from "../types";

export const XAI_PROVIDER: CuratedProviderDefinition = {
  slug: "xai",
  name: "xAI",
  models: [
    {
      id: "grok-3",
      name: "Grok 3",
      providerIds: ["openrouter:x-ai/grok-3"],
    },
    {
      id: "grok-4-fast",
      name: "Grok 4 Fast",
      providerIds: ["openrouter:x-ai/grok-4-fast"],
    },
    {
      id: "grok-4.3",
      name: "Grok 4.3",
      providerIds: ["openrouter:x-ai/grok-4.3"],
    },
    {
      id: "grok-4.20-beta",
      name: "Grok 4.20 Beta",
      providerIds: ["openrouter:x-ai/grok-4.20-beta"],
    },
  ],
};
