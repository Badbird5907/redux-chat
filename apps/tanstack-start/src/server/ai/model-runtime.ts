import type { LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

import { getChatModelConfig, resolveModelRoute } from "@redux/shared/models";
import type { ChatModelConfig, ModelRouteInfo } from "@redux/shared/models";

import { env } from "@/env";

export interface ResolvedAiSdkModel {
  model: LanguageModel;
  modelConfig: ChatModelConfig;
  route: ModelRouteInfo;
}

export function resolveAiSdkModel(modelId: string): ResolvedAiSdkModel {
  const modelConfig = getChatModelConfig(modelId);
  if (!modelConfig) {
    throw new Error(`Unknown canonical model id: ${modelId}`);
  }

  const route = resolveModelRoute(modelConfig.id);
  if (!route) {
    throw new Error(`Unable to resolve provider route for ${modelConfig.id}`);
  }

  switch (route.provider) {
    case "anthropic": {
      if (!env.ANTHROPIC_API_KEY) {
        throw new Error("ANTHROPIC_API_KEY is required for Anthropic models");
      }

      const provider = createAnthropic({
        apiKey: env.ANTHROPIC_API_KEY,
      });

      return {
        model: provider(route.vendorId),
        modelConfig,
        route,
      };
    }

    case "openai": {
      if (!env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY is required for OpenAI models");
      }

      const provider = createOpenAI({
        apiKey: env.OPENAI_API_KEY,
      });

      return {
        model: provider(route.vendorId),
        modelConfig,
        route,
      };
    }

    case "openrouter": {
      if (!env.OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY is required for OpenRouter models");
      }

      const provider = createOpenRouter({
        apiKey: env.OPENROUTER_API_KEY,
      });

      return {
        model: provider(route.vendorId),
        modelConfig,
        route,
      };
    }

    default:
      throw new Error(`Unsupported model provider: ${route.provider}`);
  }
}
