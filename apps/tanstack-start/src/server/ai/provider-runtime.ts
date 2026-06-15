import type { ImageModel, LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import type { ModelRouteInfo } from "@redux/shared/models";

import { env } from "@/env";

export interface RuntimeProviderDefinition {
  key: string;
  requiredEnv: readonly string[];
  createModel: (route: ModelRouteInfo) => LanguageModel;
  createImageModel?: (route: ModelRouteInfo) => ImageModel;
}

// when adding providers also add it to packages/models/scripts/generate-models.ts
// and packages/backend/convex/billing.ts
export const RUNTIME_PROVIDERS: Record<string, RuntimeProviderDefinition> = {
  anthropic: {
    key: "anthropic",
    requiredEnv: ["ANTHROPIC_API_KEY"],
    createModel: (route) => {
      const provider = createAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
      });

      return provider(route.vendorId);
    },
    createImageModel: (route) => {
      const provider = createOpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      return provider.image(route.vendorId);
    },
  },
  openai: {
    key: "openai",
    requiredEnv: ["OPENAI_API_KEY"],
    createModel: (route) => {
      const provider = createOpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      return provider(route.vendorId);
    },
    createImageModel: (route) => {
      const provider = createOpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      return provider.image(route.vendorId);
    },
  },
  openrouter: {
    key: "openrouter",
    requiredEnv: ["OPENROUTER_API_KEY"],
    createModel: (route) => {
      if (route.behavior.useOpenAICompatible) {
        const provider = createOpenAICompatible({
          name: "openrouter",
          apiKey: env.OPENROUTER_API_KEY,
          baseURL: "https://openrouter.ai/api/v1",
          includeUsage: true,
          supportedUrls: () => ({
            "image/*": [/^https?:\/\/.*$/],
          }),
        });

        return provider.chatModel(route.vendorId);
      }

      const provider = createOpenRouter({
        apiKey: env.OPENROUTER_API_KEY,
      });

      return provider(route.vendorId);
    },
  },
  vertex: {
    key: "vertex",
    requiredEnv: ["GOOGLE_VERTEX_API_KEY"],
    createModel: (route) => {
      const provider = createVertex({
        apiKey: env.GOOGLE_VERTEX_API_KEY,
      });
      console.log("created vertex provider");

      return provider(route.vendorId);
    },
    createImageModel: (route) => {
      const provider = createVertex({
        apiKey: env.GOOGLE_VERTEX_API_KEY,
      });

      return provider.image(route.vendorId);
    },
  },
  workersai: {
    key: "workersai",
    requiredEnv: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_KEY"],
    createModel: (route) => {
      console.log("creating workersai provider");
      const provider = createOpenAICompatible({
        name: "workersai",
        apiKey: env.CLOUDFLARE_API_KEY,
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`,
        includeUsage: true,
        supportedUrls: () => ({
          "image/*": [/^https?:\/\/.*$/],
        }),
      });

      return provider.chatModel(route.vendorId);
    },
  },
};
