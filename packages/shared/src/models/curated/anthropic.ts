import type { CuratedProviderDefinition } from "../types";

export const ANTHROPIC_PROVIDER: CuratedProviderDefinition = {
  slug: "anthropic",
  name: "Anthropic",
  benchmarks: {
    aa: { id: "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128", slug: "anthropic" },
  },
  models: [
    {
      id: "claude-sonnet-4-20250514",
      name: "Claude Sonnet 4",
      providerIds: ["anthropic:claude-sonnet-4-20250514"],
      defaultProviderId: "anthropic:claude-sonnet-4-20250514",
      benchmarks: {
        aa: {
          id: "0a603978-03b9-4f47-a273-2f7fd969be85",
          slug: "claude-sonnet-4",
        },
      },
      attachments: {
        maxFiles: 4,
      },
    },
  ],
};
