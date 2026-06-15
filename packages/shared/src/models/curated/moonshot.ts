import type { CuratedProviderDefinition } from "../types";

export const MOONSHOT_PROVIDER: CuratedProviderDefinition = {
  slug: "moonshot",
  name: "Moonshot",
  routeBehavior: {
    openrouter: { useOpenAICompatible: true },
  },
  models: [
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      providerIds: ["workersai:@cf/moonshotai/kimi-k2.7-code"],
    },
    {
      id: "kimi-k2.6",
      name: "Kimi K2.6",
      providerIds: ["workersai:@cf/moonshotai/kimi-k2.6"],
    },
    {
      id: "kimi-k2.5",
      name: "Kimi K2.5",
      providerIds: ["openrouter:moonshotai/kimi-k2.5"],
    },
  ],
};
