import type { CuratedProviderDefinition } from "../types";

export const XIAOMI_PROVIDER: CuratedProviderDefinition = {
  slug: "xiaomi",
  name: "Xiaomi",
  routeBehavior: {
    openrouter: { useOpenAICompatible: true },
  },
  models: [
    {
      id: "mimo-v2-flash",
      name: "MiMo V2 Flash",
      providerIds: ["openrouter:xiaomi/mimo-v2-flash"],
    },
    {
      id: "mimo-v2-pro",
      name: "MiMo V2 Pro",
      providerIds: ["openrouter:xiaomi/mimo-v2-pro"],
    },
    {
      id: "mimo-v2-omni",
      name: "MiMo V2 Omni",
      providerIds: ["openrouter:xiaomi/mimo-v2-omni"],
    },
    {
      id: "mimo-v2.5",
      name: "MiMo V2.5",
      providerIds: ["openrouter:xiaomi/mimo-v2.5"],
    },
    {
      id: "mimo-v2.5-pro",
      name: "MiMo V2.5 Pro",
      providerIds: ["openrouter:xiaomi/mimo-v2.5-pro"],
    },
  ],
};
