import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createVertex } from "@ai-sdk/google-vertex";

import type { ModelRouteInfo } from "@redux/shared/models";

import { env } from "@/env";
export interface RuntimeProviderDefinition {
  key: string;
  requiredEnv: readonly string[];
  createModel: (route: ModelRouteInfo) => LanguageModel;
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
  },
  openrouter: {
    key: "openrouter",
    requiredEnv: ["OPENROUTER_API_KEY"],
    createModel: (route) => {
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
  }
};
