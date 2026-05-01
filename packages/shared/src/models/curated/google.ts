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
      attachments: {
        maxFiles: 4,
      },
    },
    {
      id: "gemini-3-flash-preview",
      providerIds: [
        "openrouter:google/gemini-3-flash-preview",
        "google:gemini-3-flash-preview",
      ],
      defaultProviderId: "openrouter:google/gemini-3-flash-preview",
      attachments: {
        maxFiles: 4,
      },
    },
    {
      id: "gemini-3.1-pro-preview",
      providerIds: [
        "openrouter:google/gemini-3.1-pro-preview",
        "google:gemini-3.1-pro-preview",
      ],
      defaultProviderId: "openrouter:google/gemini-3.1-pro-preview",
      attachments: {
        maxFiles: 4,
      },
    },
  ],
};
