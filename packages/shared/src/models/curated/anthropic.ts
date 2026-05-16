import type { CuratedProviderDefinition } from "../types";

export const ANTHROPIC_PROVIDER: CuratedProviderDefinition = {
  slug: "anthropic",
  name: "Anthropic",
  benchmarks: {
    aa: { id: "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128", slug: "anthropic" },
  },
  models: [
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      providerIds: ["anthropic:claude-sonnet-4-6"],
    },
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude Sonnet 4",
      providerIds: ["anthropic:claude-sonnet-4-20250514"],
      attachments: {
        maxFiles: 4,
      },
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
