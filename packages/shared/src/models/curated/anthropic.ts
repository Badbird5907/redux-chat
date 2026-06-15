import type { CuratedProviderDefinition } from "../types";

export const ANTHROPIC_PROVIDER: CuratedProviderDefinition = {
  slug: "anthropic",
  name: "Anthropic",
  benchmarks: {
    aa: { id: "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128", slug: "anthropic" },
  },
  models: [
    {
      id: "claude-fable-5",
      name: "Claude Fable 5 (Mythos)",
      providerIds: ["anthropic:claude-fable-5"],
    },
    {
      id: "claude-opus-4-8",
      name: "Claude Opus 4.8",
      providerIds: ["anthropic:claude-opus-4-8"],
    },
    {
      id: "claude-opus-4-7",
      name: "Claude Opus 4.7",
      providerIds: ["anthropic:claude-opus-4-7"],
    },
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      providerIds: ["anthropic:claude-sonnet-4-6"],
    },
    {
      id: "claude-3-5-haiku-20241022",
      name: "Claude 3.5 Haiku",
      providerIds: [
        "openrouter:anthropic/claude-3.5-haiku",
        "anthropic:claude-3-5-haiku-20241022",
      ],
      defaultProviderId: "anthropic:claude-3-5-haiku-20241022",
      attachments: {
        maxFiles: 4,
      },
    },
    {
      id: "claude-haiku-4-5-20251001",
      name: "Claude 4.5 Haiku",
      providerIds: [
        "openrouter:anthropic/claude-haiku-4.5",
        "anthropic:claude-haiku-4-5-20251001",
      ],
      defaultProviderId: "anthropic:claude-haiku-4-5-20251001",
      attachments: {
        maxFiles: 4,
      },
    },
  ],
};
