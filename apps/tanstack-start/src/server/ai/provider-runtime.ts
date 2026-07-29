import type { ProviderCredentialPayload } from "@/server/byok/crypto";
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
  createModel: (
    route: ModelRouteInfo,
    credentials: ProviderCredentialPayload,
  ) => LanguageModel;
  createImageModel?: (
    route: ModelRouteInfo,
    credentials: ProviderCredentialPayload,
  ) => ImageModel;
}

// when adding providers also add it to packages/models/scripts/generate-models.ts
// and packages/backend/convex/billing.ts
export const RUNTIME_PROVIDERS: Record<string, RuntimeProviderDefinition> = {
  anthropic: {
    key: "anthropic",
    requiredEnv: ["ANTHROPIC_API_KEY"],
    createModel: (route, credentials) => {
      const provider = createAnthropic({
        apiKey: credentials.apiKey,
      });

      return provider(route.vendorId);
    },
  },
  openai: {
    key: "openai",
    requiredEnv: ["OPENAI_API_KEY"],
    createModel: (route, credentials) => {
      const provider = createOpenAI({
        apiKey: credentials.apiKey,
      });

      return provider(route.vendorId);
    },
    createImageModel: (route, credentials) => {
      const provider = createOpenAI({
        apiKey: credentials.apiKey,
      });

      return provider.image(route.vendorId);
    },
  },
  openrouter: {
    key: "openrouter",
    requiredEnv: ["OPENROUTER_API_KEY"],
    createModel: (route, credentials) => {
      if (route.behavior.useOpenAICompatible) {
        const provider = createOpenAICompatible({
          name: "openrouter",
          apiKey: credentials.apiKey,
          baseURL: "https://openrouter.ai/api/v1",
          includeUsage: true,
          supportedUrls: () => ({
            "image/*": [/^https?:\/\/.*$/],
          }),
        });

        return provider.chatModel(route.vendorId);
      }

      const provider = createOpenRouter({
        apiKey: credentials.apiKey,
      });

      return provider(route.vendorId);
    },
  },
  vertex: {
    key: "vertex",
    requiredEnv: ["GOOGLE_VERTEX_API_KEY"],
    createModel: (route, credentials) => {
      const provider = createVertex({
        apiKey: credentials.apiKey,
      });
      console.log("created vertex provider");

      return provider(route.vendorId);
    },
    createImageModel: (route, credentials) => {
      const provider = createVertex({
        apiKey: credentials.apiKey,
      });

      return provider.image(route.vendorId);
    },
  },
  workersai: {
    key: "workersai",
    requiredEnv: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_KEY"],
    createModel: (route, credentials) => {
      if (!credentials.accountId) {
        throw new Error("Cloudflare Workers AI account ID is required.");
      }
      console.log("creating workersai provider");
      const provider = createOpenAICompatible({
        name: "workersai",
        apiKey: credentials.apiKey,
        baseURL: `https://api.cloudflare.com/client/v4/accounts/${credentials.accountId}/ai/v1`,
        includeUsage: true,
      });

      return provider.chatModel(route.vendorId);
    },
  },
};

export function getPlatformProviderCredentials(
  providerKey: string,
): ProviderCredentialPayload {
  switch (providerKey) {
    case "anthropic":
      return { apiKey: env.ANTHROPIC_API_KEY };
    case "openai":
      return { apiKey: env.OPENAI_API_KEY };
    case "openrouter":
      return { apiKey: env.OPENROUTER_API_KEY };
    case "vertex":
      return { apiKey: env.GOOGLE_VERTEX_API_KEY };
    case "workersai":
      if (!env.CLOUDFLARE_ACCOUNT_ID) {
        throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured.");
      }
      return {
        apiKey: env.CLOUDFLARE_API_KEY,
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
      };
    default:
      throw new Error(`Unsupported runtime provider: ${providerKey}`);
  }
}
