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
      providerIds: [
        "openrouter:google/gemini-2.5-pro",
        "vertex:gemini-2.5-pro",
      ],
      defaultProviderId: "vertex:gemini-2.5-pro",
    },
    {
      id: "gemini-3-flash-preview",
      name: "Gemini 3 Flash",
      providerIds: [
        "openrouter:google/gemini-3-flash-preview",
        "vertex:gemini-3-flash-preview",
      ],
      defaultProviderId: "vertex:gemini-3-flash-preview",
    },
    {
      id: "gemini-3.1-flash-lite",
      providerIds: [
        "openrouter:google/gemini-3.1-flash-lite",
        "vertex:gemini-3.1-flash-lite",
      ],
      defaultProviderId: "vertex:gemini-3.1-flash-lite",
    },
    {
      id: "gemini-3.1-pro-preview",
      name: "Gemini 3.1 Pro",
      providerIds: [
        "openrouter:google/gemini-3.1-pro-preview",
        "vertex:gemini-3.1-pro-preview",
      ],
      defaultProviderId: "vertex:gemini-3.1-pro-preview",
    },
    {
      id: "gemini-3.5-flash",
      providerIds: [
        "openrouter:google/gemini-3.5-flash",
        "vertex:gemini-3.5-flash",
      ],
      defaultProviderId: "vertex:gemini-3.5-flash",
    },
    {
      id: "nano-banana-2",
      name: "Nano Banana 2",
      providerIds: [
        "openrouter:google/gemini-3.1-flash-image-preview",
        "vertex:gemini-3.1-flash-image-preview",
      ],
      defaultProviderId: "vertex:gemini-3.1-flash-image-preview",
      thinkingLevels: [],
      capabilities: {
        imageGenerationTool: true,
        imageOutput: true,
      },
    },
    {
      id: "nano-banana-pro",
      name: "Nano Banana Pro",
      providerIds: [
        "openrouter:google/gemini-3-pro-image-preview",
        "vertex:gemini-3-pro-image-preview",
      ],
      defaultProviderId: "vertex:gemini-3-pro-image-preview",
      thinkingLevels: [],
      capabilities: {
        imageGenerationTool: true,
        imageOutput: true,
      },
    },
  ],
};
