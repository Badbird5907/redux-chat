import type {
  ByokProviderAvailability,
  ByokProviderId,
  ByokRouteAvailability,
} from "@redux/shared/models";

export interface ProviderCredentialAvailabilitySummary {
  provider: ByokProviderId;
  connectionType: "api_key" | "chatgpt_oauth" | "openrouter_oauth";
  availableModelIds?: readonly string[];
  supportsImageGeneration?: boolean;
}

export function buildByokRouteAvailability(
  credentials: readonly ProviderCredentialAvailabilitySummary[],
): ByokRouteAvailability {
  const availability = new Map<ByokProviderId, ByokProviderAvailability>();
  for (const credential of credentials) {
    availability.set(
      credential.provider,
      credential.connectionType === "chatgpt_oauth"
        ? {
            kind: "models",
            modelIds: new Set(credential.availableModelIds ?? []),
            supportsImageGeneration:
              credential.supportsImageGeneration === true,
          }
        : { kind: "all" },
    );
  }
  return availability;
}

export function connectionFundingLabel(
  connectionType: "api_key" | "chatgpt_oauth" | "openrouter_oauth" | undefined,
): string {
  switch (connectionType) {
    case "chatgpt_oauth":
      return "Your ChatGPT subscription";
    case "openrouter_oauth":
      return "Your OpenRouter connection";
    default:
      return "Your API key";
  }
}
