import type { ModelRouteInfo } from "./types";
import {
  CHAT_MODELS,
  getChatModelConfig,
  getModelRoute,
  getModelRoutes,
} from "./registry";

export const BYOK_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "vertex",
  "workersai",
  "openrouter",
] as const;

export type ByokProviderId = (typeof BYOK_PROVIDER_IDS)[number];
export type RoutingPreset = "native_first" | "openrouter_first" | "custom";
export type RouteFundingSource = "user" | "platform";

export type ByokProviderAvailability =
  | { kind: "all" }
  | {
      kind: "models";
      modelIds: ReadonlySet<string>;
      supportsImageGeneration: boolean;
    };

export type ByokRouteAvailability = ReadonlyMap<
  ByokProviderId,
  ByokProviderAvailability
>;

export type ModelRoutingOverride =
  | {
      modelId: string;
      kind: "byok";
      routeId: string;
    }
  | {
      modelId: string;
      kind: "hosted";
    };

export interface UserModelRoutingConfig {
  preset: RoutingPreset;
  providerPriority: ByokProviderId[];
  hostedFallback: boolean;
  overrides: ModelRoutingOverride[];
  catalogVersion: string;
}

export interface EffectiveModelRoute {
  route: ModelRouteInfo;
  fundingSource: RouteFundingSource;
  reason: "override" | "priority" | "fallback";
}

export const NATIVE_FIRST_PROVIDER_PRIORITY: ByokProviderId[] = [
  "openai",
  "anthropic",
  "vertex",
  "workersai",
  "openrouter",
];

export const OPENROUTER_FIRST_PROVIDER_PRIORITY: ByokProviderId[] = [
  "openrouter",
  "openai",
  "anthropic",
  "vertex",
  "workersai",
];

export const MODEL_ROUTING_CATALOG_VERSION = hashCatalog(
  CHAT_MODELS.map((model) => `${model.id}:${model.providerIds.join(",")}`).join(
    "|",
  ),
);

export const DEFAULT_MODEL_ROUTING_CONFIG: UserModelRoutingConfig = {
  preset: "native_first",
  providerPriority: [...NATIVE_FIRST_PROVIDER_PRIORITY],
  hostedFallback: true,
  overrides: [],
  catalogVersion: MODEL_ROUTING_CATALOG_VERSION,
};

export function isByokProviderId(value: string): value is ByokProviderId {
  return BYOK_PROVIDER_IDS.includes(value as ByokProviderId);
}

export function providerPriorityForPreset(
  preset: Exclude<RoutingPreset, "custom">,
): ByokProviderId[] {
  return preset === "openrouter_first"
    ? [...OPENROUTER_FIRST_PROVIDER_PRIORITY]
    : [...NATIVE_FIRST_PROVIDER_PRIORITY];
}

export function sanitizeModelRoutingConfig(
  value: Partial<UserModelRoutingConfig> | null | undefined,
): UserModelRoutingConfig {
  const preset: RoutingPreset =
    value?.preset === "openrouter_first" || value?.preset === "custom"
      ? value.preset
      : "native_first";
  const configuredPriority = uniqueProviders(value?.providerPriority ?? []);
  const providerPriority =
    preset === "custom"
      ? uniqueProviders([
          ...configuredPriority,
          ...NATIVE_FIRST_PROVIDER_PRIORITY,
        ])
      : providerPriorityForPreset(preset);

  const seenModels = new Set<string>();
  const overrides: ModelRoutingOverride[] = [];
  for (const override of value?.overrides ?? []) {
    if (seenModels.has(override.modelId)) {
      continue;
    }
    const model = getChatModelConfig(override.modelId);
    if (!model) {
      continue;
    }
    if (override.kind === "hosted") {
      seenModels.add(model.id);
      overrides.push({ modelId: model.id, kind: "hosted" });
      continue;
    }
    const route = getModelRoute(override.routeId);
    if (!route || !model.providerIds.includes(route.id)) {
      continue;
    }
    if (!isByokProviderId(route.provider)) {
      continue;
    }
    seenModels.add(model.id);
    overrides.push({
      modelId: model.id,
      kind: "byok",
      routeId: route.id,
    });
  }

  return {
    preset,
    providerPriority,
    hostedFallback: value?.hostedFallback !== false,
    overrides,
    catalogVersion: MODEL_ROUTING_CATALOG_VERSION,
  };
}

export function resolveEffectiveModelRoute(args: {
  modelId: string;
  config?: Partial<UserModelRoutingConfig> | null;
  availability: ByokRouteAvailability;
  byokEnabled: boolean;
}): EffectiveModelRoute | undefined {
  const model = getChatModelConfig(args.modelId);
  if (!model) {
    return undefined;
  }
  const config = sanitizeModelRoutingConfig(args.config);
  const override = config.overrides.find((item) => item.modelId === model.id);

  if (override?.kind === "hosted") {
    const route = getModelRoute(model.defaultProviderId);
    return route
      ? { route, fundingSource: "platform", reason: "override" }
      : undefined;
  }

  if (override?.kind === "byok" && args.byokEnabled) {
    const route = getModelRoute(override.routeId);
    if (
      route &&
      isByokProviderId(route.provider) &&
      isByokRouteAvailable(route, args.availability)
    ) {
      return { route, fundingSource: "user", reason: "override" };
    }
  }

  if (args.byokEnabled) {
    const priority = new Map(
      config.providerPriority.map((provider, index) => [provider, index]),
    );
    const byokRoute = getModelRoutes(model.id)
      .filter(
        (route) =>
          isByokProviderId(route.provider) &&
          isByokRouteAvailable(route, args.availability),
      )
      .sort(
        (a, b) =>
          (priority.get(a.provider as ByokProviderId) ??
            Number.MAX_SAFE_INTEGER) -
          (priority.get(b.provider as ByokProviderId) ??
            Number.MAX_SAFE_INTEGER),
      )[0];
    if (byokRoute) {
      return {
        route: byokRoute,
        fundingSource: "user",
        reason: "priority",
      };
    }
  }

  if (!config.hostedFallback) {
    return undefined;
  }
  const fallback = getModelRoute(model.defaultProviderId);
  return fallback
    ? { route: fallback, fundingSource: "platform", reason: "fallback" }
    : undefined;
}

export function isByokRouteAvailable(
  route: ModelRouteInfo,
  availability: ByokRouteAvailability,
): boolean {
  if (!isByokProviderId(route.provider)) {
    return false;
  }
  const providerAvailability = availability.get(route.provider);
  if (!providerAvailability) {
    return false;
  }
  if (providerAvailability.kind === "all") {
    return true;
  }
  if (route.supports.imageOutput) {
    return providerAvailability.supportsImageGeneration;
  }
  return providerAvailability.modelIds.has(route.vendorId);
}

export function generationRequiresPlatformCredits(args: {
  mainFundingSource?: RouteFundingSource;
  canInvokeTools: boolean;
  searchEnabled: boolean;
  analysisWorkspaceEnabled: boolean;
  imageToolFundingSource?: RouteFundingSource;
}): boolean {
  return (
    args.mainFundingSource === "platform" ||
    (args.canInvokeTools &&
      (args.searchEnabled ||
        args.analysisWorkspaceEnabled ||
        args.imageToolFundingSource === "platform"))
  );
}

function uniqueProviders(values: readonly string[]): ByokProviderId[] {
  return Array.from(
    new Set(
      values.filter((value): value is ByokProviderId =>
        isByokProviderId(value),
      ),
    ),
  );
}

function hashCatalog(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
