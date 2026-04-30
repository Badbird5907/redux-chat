import type { CuratedProviderDefinition } from "../types";

export const OPENAI_PROVIDER: CuratedProviderDefinition = {
  slug: "openai",
  name: "OpenAI",
  benchmarks: {
    aa: { id: "e67e56e3-15cd-43db-b679-da4660a69f41", slug: "openai" },
  },
  models: [
    {
      id: "gpt-5-mini",
      providerIds: ["openrouter:openai/gpt-5-mini", "openai:gpt-5-mini"],
      defaultProviderId: "openai:gpt-5-mini", //"openrouter:openai/gpt-5-mini",
    },
  ],
};
