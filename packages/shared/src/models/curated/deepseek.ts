import type { CuratedProviderDefinition } from "../types";

export const DEEPSEEK_PROVIDER: CuratedProviderDefinition = {
  slug: "deepseek",
  name: "DeepSeek",
  models: [
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      providerIds: ["openrouter:deepseek/deepseek-v4-flash"],
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      providerIds: ["openrouter:deepseek/deepseek-v4-pro"],
    },
  ],
};
