import type {
  ByokProviderAvailability,
  ByokProviderId,
  ByokRouteAvailability,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";

import type { ProviderCredentialPayload } from "./crypto";
import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { loadFreshChatGptCredential } from "./chatgpt-refresh";
import { decryptProviderCredential } from "./crypto";

export interface ByokRuntimeContext {
  credentials: Map<ByokProviderId, ProviderCredentialPayload>;
  availability: ByokRouteAvailability;
  routing: UserModelRoutingConfig;
}

export async function loadByokRuntimeContext(
  userId: string,
): Promise<ByokRuntimeContext> {
  await fetchAuthMutation(api.functions.byok.internal_reconcileUser, {
    secret: env.INTERNAL_CONVEX_SECRET,
    userId,
  });
  const bundle = await fetchAuthQuery(
    api.functions.byok.internal_getEncryptedBundle,
    { secret: env.INTERNAL_CONVEX_SECRET, userId },
  );
  const credentials = new Map<ByokProviderId, ProviderCredentialPayload>();
  const availability = new Map<ByokProviderId, ByokProviderAvailability>();
  const prepared = await Promise.all(
    bundle.credentials.map(async (encrypted) => {
      let payload: ProviderCredentialPayload;
      try {
        payload = decryptProviderCredential({
          userId,
          provider: encrypted.provider,
          encrypted,
        });
      } catch (error) {
        console.error("Failed to decrypt BYOK credential", {
          userId,
          provider: encrypted.provider,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        return undefined;
      }

      if (
        encrypted.provider === "openai" &&
        payload.kind === "chatgpt_oauth"
      ) {
        const fresh = await loadFreshChatGptCredential({ userId });
        if (!fresh) return undefined;
        payload = fresh.payload;
      }
      const providerAvailability: ByokProviderAvailability =
        payload.kind === "chatgpt_oauth"
          ? {
              kind: "models",
              modelIds: new Set(payload.modelIds),
              supportsImageGeneration:
                encrypted.supportsImageGeneration === true,
            }
          : { kind: "all" };
      return {
        provider: encrypted.provider,
        payload,
        availability: providerAvailability,
      };
    }),
  );
  for (const item of prepared) {
    if (!item) continue;
    credentials.set(item.provider, item.payload);
    availability.set(item.provider, item.availability);
  }
  return { credentials, availability, routing: bundle.routing };
}
