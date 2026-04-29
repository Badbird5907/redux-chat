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
      defaultProviderId: "openrouter:openai/gpt-5-mini",
      benchmarks: {
        aa: { id: "29855680-7469-43eb-8b88-cd3fb1d99da3", slug: "gpt-5-mini" },
      },
      attachments: {
        maxFiles: 4,
      },
    },
  ],
};
