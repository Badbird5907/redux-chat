import type { CuratedProviderDefinition } from "../types";

export const OPENAI_PROVIDER: CuratedProviderDefinition = {
  slug: "openai",
  name: "OpenAI",
  benchmarks: {
    aa: { id: "e67e56e3-15cd-43db-b679-da4660a69f41", slug: "openai" },
  },
  models: [
    {
      id: "gpt-5.5-pro",
      providerIds: ["openrouter:openai/gpt-5.5-pro", "openai:gpt-5.5-pro"],
      defaultProviderId: "openai:gpt-5.5-pro",
    },
    {
      id: "gpt-5.5",
      providerIds: ["openrouter:openai/gpt-5.5", "openai:gpt-5.5"],
      defaultProviderId: "openai:gpt-5.5",
    },
    {
      id: "gpt-5.4-mini",
      providerIds: ["openrouter:openai/gpt-5.4-mini", "openai:gpt-5.4-mini"],
      defaultProviderId: "openai:gpt-5.4-mini",
    },
    {
      id: "gpt-5.4-nano",
      providerIds: ["openrouter:openai/gpt-5.4-nano", "openai:gpt-5.4-nano"],
      defaultProviderId: "openai:gpt-5.4-nano",
    },
    {
      id: "gpt-5.4",
      providerIds: ["openrouter:openai/gpt-5.4", "openai:gpt-5.4"],
      defaultProviderId: "openai:gpt-5.4",
    },
    {
      id: "gpt-5.3",
      name: "GPT-5.3",
      providerIds: ["openai:gpt-5.3-chat-latest"],
      defaultProviderId: "openai:gpt-5.3-chat-latest",
    },
    {
      id: "gpt-5-mini",
      providerIds: ["openrouter:openai/gpt-5-mini", "openai:gpt-5-mini"],
      defaultProviderId: "openai:gpt-5-mini",
    },
    {
      id: "gpt-oss-120b",
      name: "GPT OSS 120B",
      providerIds: ["openrouter:openai/gpt-oss-120b"],
      defaultProviderId: "openrouter:openai/gpt-oss-120b",
    },
  ],
};
