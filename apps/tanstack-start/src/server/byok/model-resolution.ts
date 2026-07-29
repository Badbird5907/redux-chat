import {
  getChatModelConfig,
  isByokProviderId,
  resolveEffectiveModelRoute,
} from "@redux/shared/models";

import type { ByokRuntimeContext } from "./runtime";
import {
  resolveAiSdkImageModelForRoute,
  resolveAiSdkModelForRoute,
} from "@/server/ai/model-runtime";
import { getPlatformProviderCredentials } from "@/server/ai/provider-runtime";

export function resolveRoutedAiSdkModel(args: {
  modelId: string;
  byokEnabled: boolean;
  context: ByokRuntimeContext;
}) {
  const resolved = resolveSelection(args);
  return {
    ...resolveAiSdkModelForRoute(
      resolved.modelConfig,
      resolved.selection.route,
      resolved.credentials,
    ),
    fundingSource: resolved.selection.fundingSource,
    routingReason: resolved.selection.reason,
  };
}

export function resolveRoutedAiSdkImageModel(args: {
  modelId: string;
  byokEnabled: boolean;
  context: ByokRuntimeContext;
}) {
  const resolved = resolveSelection(args);
  return {
    ...resolveAiSdkImageModelForRoute(
      resolved.modelConfig,
      resolved.selection.route,
      resolved.credentials,
    ),
    fundingSource: resolved.selection.fundingSource,
    routingReason: resolved.selection.reason,
  };
}

function resolveSelection(args: {
  modelId: string;
  byokEnabled: boolean;
  context: ByokRuntimeContext;
}) {
  const modelConfig = getChatModelConfig(args.modelId);
  if (!modelConfig) {
    throw new Error(`Unknown canonical model id: ${args.modelId}`);
  }
  const selection = resolveEffectiveModelRoute({
    modelId: modelConfig.id,
    config: args.context.routing,
    availableProviders: new Set(args.context.credentials.keys()),
    byokEnabled: args.byokEnabled,
  });
  if (!selection) {
    const error = new Error(
      "No configured provider can serve this model and hosted fallback is disabled.",
    );
    error.name = "ByokRouteUnavailableError";
    throw error;
  }
  const runtimeProviderKey =
    selection.route.behavior.runtimeProviderKey ?? selection.route.provider;
  const credentials =
    selection.fundingSource === "user"
      ? isByokProviderId(runtimeProviderKey)
        ? args.context.credentials.get(runtimeProviderKey)
        : undefined
      : getPlatformProviderCredentials(runtimeProviderKey);
  if (!credentials) {
    throw new Error(`Missing credentials for ${runtimeProviderKey}.`);
  }
  return { modelConfig, selection, credentials };
}
