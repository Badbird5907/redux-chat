import type { CuratedProviderDefinition } from "../types";

export const GOOGLE_PROVIDER: CuratedProviderDefinition = {
  slug: "google",
  name: "Google",
  benchmarks: {
    aa: { id: "faddc6d9-2c14-445f-9b28-56726f59c793", slug: "google" },
  },
  models: [
    {
      id: "gemini-2.5-pro",
      providerIds: ["openrouter:google/gemini-2.5-pro"],
      defaultProviderId: "openrouter:google/gemini-2.5-pro",
      benchmarks: {
        aa: {
          id: "27202e5f-c82d-4710-92e9-4317877d4883",
          slug: "gemini-2-5-pro",
        },
      },
      attachments: {
        maxFiles: 4,
      },
    },
  ],
};
