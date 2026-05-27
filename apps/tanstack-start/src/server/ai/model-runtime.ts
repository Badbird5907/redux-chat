import type { ImageModel, LanguageModel } from "ai";

import type { ChatModelConfig, ModelRouteInfo } from "@redux/shared/models";
import { getChatModelConfig, resolveModelRoute } from "@redux/shared/models";

import { RUNTIME_PROVIDERS } from "./provider-runtime";

export interface ResolvedAiSdkModel {
  model: LanguageModel;
  modelConfig: ChatModelConfig;
  route: ModelRouteInfo;
}

export interface ResolvedAiSdkImageModel {
  model: ImageModel;
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

  const runtimeProviderKey =
    route.behavior.runtimeProviderKey ?? route.provider;
  console.log(
    `Resolving model runtime for ${modelId} with provider: ${runtimeProviderKey}`,
  );
  const runtimeProvider = RUNTIME_PROVIDERS[runtimeProviderKey];
  if (!runtimeProvider) {
    throw new Error(`Unsupported runtime provider: ${runtimeProviderKey}`);
  }

  return {
    model: runtimeProvider.createModel(route),
    modelConfig,
    route,
  };
}

export function resolveAiSdkImageModel(
  modelId: string,
): ResolvedAiSdkImageModel {
  const modelConfig = getChatModelConfig(modelId);
  if (!modelConfig) {
    throw new Error(`Unknown canonical model id: ${modelId}`);
  }

  const route = resolveModelRoute(modelConfig.id);
  if (!route) {
    throw new Error(`Unable to resolve provider route for ${modelConfig.id}`);
  }

  const runtimeProviderKey =
    route.behavior.runtimeProviderKey ?? route.provider;
  const runtimeProvider = RUNTIME_PROVIDERS[runtimeProviderKey];
  if (!runtimeProvider?.createImageModel) {
    throw new Error(
      `Unsupported image runtime provider: ${runtimeProviderKey}`,
    );
  }

  return {
    model: runtimeProvider.createImageModel(route),
    modelConfig,
    route,
  };
}
