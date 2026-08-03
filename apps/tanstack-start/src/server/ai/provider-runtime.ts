import type { ProviderCredentialPayload } from "@/server/byok/crypto";
import type { ImageModel, LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createVertex } from "@ai-sdk/google-vertex";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createChatGPT } from "@opencoredev/loginwithchatgpt-ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import type { ModelRouteInfo } from "@redux/shared/models";

import { env } from "@/env";
import { withoutRefreshToken } from "@/server/byok/chatgpt-refresh";
import { createChatGptImageModel } from "./chatgpt-image-model";
import { createChatGptImagesClient } from "./chatgpt-images-client";

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
      const apiKey = apiKeyFromCredential(credentials, "anthropic");
      const provider = createAnthropic({
        apiKey,
      });

      return provider(route.vendorId);
    },
  },
  openai: {
    key: "openai",
    requiredEnv: ["OPENAI_API_KEY"],
    createModel: (route, credentials) => {
      if (credentials.kind === "chatgpt_oauth") {
        const provider = createChatGPT({
          credentials: withoutRefreshToken(credentials.tokens),
          defaultModel: credentials.defaultModel,
        });
        return provider.responses(route.vendorId);
      }
      const provider = createOpenAI({
        apiKey: credentials.apiKey,
      });

      return provider(route.vendorId);
    },
    createImageModel: (route, credentials) => {
      if (credentials.kind === "chatgpt_oauth") {
        return createChatGptImageModel({
          images: createChatGptImagesClient({
            tokens: withoutRefreshToken(credentials.tokens),
            defaultModel: credentials.defaultModel,
          }),
          modelId: route.vendorId,
          defaultModel: credentials.defaultModel,
        });
      }
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
      const apiKey = apiKeyFromCredential(credentials, "openrouter");
      if (route.behavior.useOpenAICompatible) {
        const provider = createOpenAICompatible({
          name: "openrouter",
          apiKey,
          baseURL: "https://openrouter.ai/api/v1",
          includeUsage: true,
          supportedUrls: () => ({
            "image/*": [/^https?:\/\/.*$/],
          }),
        });

        return provider.chatModel(route.vendorId);
      }

      const provider = createOpenRouter({
        apiKey,
      });

      return provider(route.vendorId);
    },
  },
  vertex: {
    key: "vertex",
    requiredEnv: ["GOOGLE_VERTEX_API_KEY"],
    createModel: (route, credentials) => {
      const apiKey = apiKeyFromCredential(credentials, "vertex");
      const provider = createVertex({
        apiKey,
      });
      console.log("created vertex provider");

      return provider(route.vendorId);
    },
    createImageModel: (route, credentials) => {
      const apiKey = apiKeyFromCredential(credentials, "vertex");
      const provider = createVertex({
        apiKey,
      });

      return provider.image(route.vendorId);
    },
  },
  workersai: {
    key: "workersai",
    requiredEnv: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_KEY"],
    createModel: (route, credentials) => {
      const apiKey = apiKeyFromCredential(credentials, "workersai");
      if (credentials.kind !== "api_key") {
        throw new Error("Cloudflare Workers AI requires API-key credentials.");
      }
      if (!credentials.accountId) {
        throw new Error("Cloudflare Workers AI account ID is required.");
      }
      console.log("creating workersai provider");
      const provider = createOpenAICompatible({
        name: "workersai",
        apiKey,
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
      return apiKeyCredential(env.ANTHROPIC_API_KEY);
    case "openai":
      return apiKeyCredential(env.OPENAI_API_KEY);
    case "openrouter":
      return apiKeyCredential(env.OPENROUTER_API_KEY);
    case "vertex":
      return apiKeyCredential(env.GOOGLE_VERTEX_API_KEY);
    case "workersai":
      if (!env.CLOUDFLARE_ACCOUNT_ID) {
        throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured.");
      }
      return {
        version: 2,
        kind: "api_key",
        source: "manual",
        apiKey: env.CLOUDFLARE_API_KEY,
        accountId: env.CLOUDFLARE_ACCOUNT_ID,
      };
    default:
      throw new Error(`Unsupported runtime provider: ${providerKey}`);
  }
}

function apiKeyCredential(apiKey: string): ProviderCredentialPayload {
  return { version: 2, kind: "api_key", source: "manual", apiKey };
}

function apiKeyFromCredential(
  credential: ProviderCredentialPayload,
  provider: string,
): string {
  if (credential.kind !== "api_key") {
    throw new Error(`${provider} requires API-key credentials.`);
  }
  return credential.apiKey;
}
