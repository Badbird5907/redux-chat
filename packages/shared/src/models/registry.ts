import { lookupMimeTypeFromFile } from "@silo-storage/mime-types";

import {
  calculateModelCost,
  calculateModelCostFromUsage,
  getModelSpec,
  getProviderCatalog,
  MODELS_DEV_PROVIDERS,
} from "@redux/models";

import type {
  CanonicalCuratedModelDefinition,
  CanonicalModelId,
  ChatModelConfig,
  ModelProviderInfo,
  ModelProviderRouteId,
  ModelRouteBehavior,
  ModelRouteInfo,
} from "./types";
import { expandAllowedMimeTypes } from "./attachments";
import { PROVIDERS } from "./curated";
import {
  getRouteAcceptedExtensions,
  getRouteAcceptedMimeTypes,
  getRouteAttachmentBehavior,
  mergeModelRouteBehavior,
  resolveAttachmentDeliveryMode,
} from "./route-behavior";

export { PROVIDERS };

function toCanonicalModelId(
  providerSlug: string,
  modelId: string,
): CanonicalModelId {
  return `${providerSlug}/${modelId}`;
}

export const CURATED_MODELS: CanonicalCuratedModelDefinition[] =
  PROVIDERS.flatMap((provider) =>
    provider.models.map((model) => ({
      ...model,
      id: toCanonicalModelId(provider.slug, model.id),
      providerSlug: provider.slug,
      providerName: provider.name,
      providerBenchmarks: provider.benchmarks,
    })),
  );

const ROUTE_TO_MODEL_ID = new Map<ModelProviderRouteId, CanonicalModelId>();
const ROUTE_BEHAVIOR_OVERRIDES = new Map<
  ModelProviderRouteId,
  ModelRouteBehavior
>();

for (const model of CURATED_MODELS) {
  for (const providerId of model.providerIds) {
    ROUTE_TO_MODEL_ID.set(providerId, model.id);
    const routeBehavior = model.routeBehavior?.[providerId];
    if (routeBehavior) {
      ROUTE_BEHAVIOR_OVERRIDES.set(providerId, routeBehavior);
    }
  }
}

export const MODEL_ROUTES: ModelRouteInfo[] = Array.from(
  new Set(CURATED_MODELS.flatMap((model) => model.providerIds)),
).map((routeId) => {
  const route = getModelSpec(MODELS_DEV_PROVIDERS, routeId);
  if (!route) {
    throw new Error(`Unknown model route: ${routeId}`);
  }

  return {
    ...route,
    canonicalModelId: ROUTE_TO_MODEL_ID.get(route.id),
    behavior: mergeModelRouteBehavior(
      route.provider,
      ROUTE_BEHAVIOR_OVERRIDES.get(route.id),
    ),
  };
});

const MODEL_ROUTE_BY_ID = new Map(
  MODEL_ROUTES.map((route) => [route.id, route] as const),
);

export const CHAT_MODELS: ChatModelConfig[] = CURATED_MODELS.map((model) => {
  const defaultProviderId = model.defaultProviderId ?? model.providerIds[0];
  const defaultRoute = defaultProviderId
    ? MODEL_ROUTE_BY_ID.get(defaultProviderId)
    : undefined;

  if (!defaultProviderId || !defaultRoute) {
    throw new Error(`Missing default provider route for ${model.id}`);
  }

  const allowedMimeTypes = getRouteAcceptedMimeTypes(
    defaultRoute,
    model.attachments,
  );
  const accept = getRouteAcceptedExtensions(defaultRoute, model.attachments);

  return {
    id: model.id,
    name: model.name ?? defaultRoute.displayName,
    maker: model.providerSlug,
    provider: defaultRoute.providerName,
    providerIds: [...model.providerIds],
    defaultProviderId,
    accept,
    allowedMimeTypes,
    acceptedChatExtensions: accept,
    acceptedChatMimeTypes: allowedMimeTypes,
    maxFiles:
      allowedMimeTypes.length > 0
        ? (model.attachments?.maxFiles ?? 4)
        : undefined,
    knowledgeCutoff: defaultRoute.knowledgeCutoff,
    supports: {
      ...defaultRoute.supports,
      attachments: allowedMimeTypes.length > 0,
    },
    costs: defaultRoute.pricing,
    pricingMetadata: defaultRoute.pricingMetadata,
    context: defaultRoute.context,
    modalities: defaultRoute.modalities,
    releasedAt: defaultRoute.releasedAt,
    verifiedAt: defaultRoute.verifiedAt,
    benchmarks: model.benchmarks,
    custom: model.custom,
  };
});

const CHAT_MODEL_BY_ID = new Map(
  CHAT_MODELS.map((model) => [model.id, model] as const),
);

export const DEFAULT_CHAT_MODEL_ID: CanonicalModelId =
  CHAT_MODELS[0]?.id ?? "openai/gpt-5-mini";

export const MODEL_PROVIDERS: ModelProviderInfo[] = Array.from(
  new Set(MODEL_ROUTES.map((route) => route.provider)),
).map((providerId) => {
  const provider = getProviderCatalog(MODELS_DEV_PROVIDERS, providerId);
  if (!provider) {
    throw new Error(`Unknown model provider: ${providerId}`);
  }

  const routes = MODEL_ROUTES.filter((route) => route.provider === providerId);
  const modelIds = Array.from(
    new Set(
      routes.flatMap((route) =>
        route.canonicalModelId ? [route.canonicalModelId] : [],
      ),
    ),
  );

  return {
    id: provider.id,
    name: provider.name,
    api: provider.api,
    npm: provider.npm,
    doc: provider.doc,
    env: provider.env,
    routeIds: routes.map((route) => route.id),
    modelIds,
  };
});

export function normalizeModelId(
  modelId: string,
): CanonicalModelId | undefined {
  const normalized = modelId.trim();
  if (!normalized) {
    return undefined;
  }

  if (CHAT_MODEL_BY_ID.has(normalized as CanonicalModelId)) {
    return normalized as CanonicalModelId;
  }

  return MODEL_ROUTE_BY_ID.get(normalized as ModelProviderRouteId)
    ?.canonicalModelId;
}

export function getChatModelConfig(
  modelId: string,
): ChatModelConfig | undefined {
  const canonicalModelId = normalizeModelId(modelId);
  return canonicalModelId ? CHAT_MODEL_BY_ID.get(canonicalModelId) : undefined;
}

export function getModelRoute(routeId: string): ModelRouteInfo | undefined {
  return MODEL_ROUTE_BY_ID.get(routeId as ModelProviderRouteId);
}

export function resolveModelRoute(modelId: string): ModelRouteInfo | undefined {
  const directRoute = getModelRoute(modelId);
  if (directRoute) {
    return directRoute;
  }

  const config = getChatModelConfig(modelId);
  return config ? getModelRoute(config.defaultProviderId) : undefined;
}

export function getModelAttachmentExpects(modelId: string) {
  const config = getChatModelConfig(modelId);
  if (!config || config.allowedMimeTypes.length === 0) {
    return [];
  }

  return [
    {
      mimeTypes: config.allowedMimeTypes,
      maxFileCount: config.maxFiles,
    },
  ];
}

export function isFileAllowedForModel(
  modelId: string,
  file: { name: string; type: string },
): boolean {
  const config = getChatModelConfig(modelId);
  if (!config || config.allowedMimeTypes.length === 0) {
    return false;
  }

  const expandedMimeTypes = expandAllowedMimeTypes(config.allowedMimeTypes);
  if (file.type && expandedMimeTypes.includes(file.type)) {
    return true;
  }

  const inferredMimeType = lookupMimeTypeFromFile(file.name, file.type);
  return inferredMimeType
    ? expandedMimeTypes.includes(inferredMimeType)
    : false;
}

export function getModelRouteBehavior(routeId: string) {
  const route = getModelRoute(routeId);
  return route ? getRouteAttachmentBehavior(route) : undefined;
}

export function getAttachmentDeliveryPolicy(routeId: string) {
  return getModelRouteBehavior(routeId)?.attachmentPolicy;
}

export function resolveModelAttachmentDelivery(
  routeId: string,
  file: { name: string; type: string },
) {
  const route = getModelRoute(routeId);
  if (!route) {
    return undefined;
  }

  return resolveAttachmentDeliveryMode(route, {
    fileName: file.name,
    mimeType: file.type,
  });
}

export { calculateModelCost, calculateModelCostFromUsage };
