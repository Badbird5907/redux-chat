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
      providerIds: ["openrouter:google/gemini-2.5-pro", "vertex:gemini-2.5-pro"],
      defaultProviderId: "vertex:gemini-2.5-pro",
    },
    {
      id: "gemini-3-flash-preview",
      providerIds: [
        "openrouter:google/gemini-3-flash-preview",
        "vertex:gemini-3-flash-preview",
      ],
      defaultProviderId: "vertex:gemini-3-flash-preview",
    },
    {
      id: "gemini-3.1-pro-preview",
      providerIds: [
        "openrouter:google/gemini-3.1-pro-preview",
        "vertex:gemini-3.1-pro-preview",
      ],
      defaultProviderId: "vertex:gemini-3.1-pro-preview",
    },
  ],
};
