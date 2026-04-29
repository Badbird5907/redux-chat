import type { ModelsDevProviderCatalog } from "./types";

export type ProviderCatalogMap = Record<string, ModelsDevProviderCatalog>;

export function parseRouteId(routeId: string):
  | {
      provider: string;
      vendorId: string;
    }
  | undefined {
  const separatorIndex = routeId.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === routeId.length - 1) {
    return undefined;
  }

  return {
    provider: routeId.slice(0, separatorIndex),
    vendorId: routeId.slice(separatorIndex + 1),
  };
}

export function getProviderCatalog(
  providers: ProviderCatalogMap,
  providerId: string,
): ModelsDevProviderCatalog | undefined {
  return providers[providerId];
}

export function getProviderModel(
  providers: ProviderCatalogMap,
  routeId: string,
) {
  const parsed = parseRouteId(routeId);
  if (!parsed) {
    return undefined;
  }

  const provider = providers[parsed.provider];
  const model = provider?.models[parsed.vendorId];

  if (!provider || !model) {
    return undefined;
  }

  return {
    provider,
    model,
    vendorId: parsed.vendorId,
  };
}
