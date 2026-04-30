import type { CuratedProviderDefinition } from "../types";

export const MOONSHOT_PROVIDER: CuratedProviderDefinition = {
  slug: "moonshot",
  name: "Moonshot",
  models: [
    {
      id: "kimi-k2.6",
      name: "Kimi K2.6",
      providerIds: ["openrouter:moonshotai/kimi-k2.6"],
    },
    {
      id: "kimi-k2.5",
      name: "Kimi K2.5",
      providerIds: ["openrouter:moonshotai/kimi-k2.5"],
    }
  ]
}