import type { CuratedProviderDefinition } from "../types";

export const ANTHROPIC_PROVIDER: CuratedProviderDefinition = {
  slug: "anthropic",
  name: "Anthropic",
  benchmarks: {
    aa: { id: "f0aa413f-e8ae-4fcd-9c48-0e049f4f3128", slug: "anthropic" },
  },
  models: [
    {
      id: "claude-3-5-sonnet",
      name: "Claude 3.5 Sonnet",
      providerIds: ["anthropic:claude-3-5-sonnet-20241022"],
      defaultProviderId: "anthropic:claude-3-5-sonnet-20241022",
      benchmarks: {
        aa: {
          id: "0a603978-03b9-4f47-a273-2f7fd969be85",
          slug: "claude-35-sonnet",
        },
      },
      attachments: {
        maxFiles: 4,
      },
    },
  ],
};
