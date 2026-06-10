import type { CuratedProviderDefinition } from "../types";

export const QWEN_PROVIDER: CuratedProviderDefinition = {
  slug: "qwen",
  name: "Qwen",
  models: [
    {
      id: "qwen3-coder-plus",
      name: "Qwen3 Coder Plus",
      providerIds: ["openrouter:qwen/qwen3-coder-plus"],
    },
    {
      id: "qwen3-coder-next",
      name: "Qwen3 Coder Next",
      providerIds: ["openrouter:qwen/qwen3-coder-next"],
    },
    {
      id: "qwen3-coder-flash",
      name: "Qwen3 Coder Flash",
      providerIds: ["openrouter:qwen/qwen3-coder-flash"],
    },
    {
      id: "qwen3-max",
      name: "Qwen3 Max",
      providerIds: ["openrouter:qwen/qwen3-max"],
    },
  ],
};
