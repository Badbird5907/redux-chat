import type {
  ByokProviderId,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";

import type { ProviderCredentialPayload } from "./crypto";
import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { decryptProviderCredential } from "./crypto";

export interface ByokRuntimeContext {
  credentials: Map<ByokProviderId, ProviderCredentialPayload>;
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
  for (const encrypted of bundle.credentials) {
    try {
      credentials.set(
        encrypted.provider,
        decryptProviderCredential({
          userId,
          provider: encrypted.provider,
          encrypted,
        }),
      );
    } catch (error) {
      console.error("Failed to decrypt BYOK credential", {
        userId,
        provider: encrypted.provider,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  return { credentials, routing: bundle.routing };
}
