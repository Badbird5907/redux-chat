import type { ByokProviderId } from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";

import type { ProviderCredentialPayload } from "./crypto";
import { env } from "@/env";
import { fetchAuthMutation } from "@/lib/auth/server";
import {
  connectionTypeForCredential,
  encryptProviderCredential,
} from "./crypto";

export interface ProviderCredentialPublicMetadata {
  displaySuffix: string;
  displayLabel?: string;
  availableModelIds?: string[];
  supportsImageGeneration?: boolean;
}

export async function upsertProviderCredential(args: {
  userId: string;
  provider: ByokProviderId;
  payload: ProviderCredentialPayload;
  metadata: ProviderCredentialPublicMetadata;
}): Promise<void> {
  const encrypted = encryptProviderCredential(args);
  await fetchAuthMutation(api.functions.byok.internal_upsertCredential, {
    secret: env.INTERNAL_CONVEX_SECRET,
    userId: args.userId,
    provider: args.provider,
    ...encrypted,
    connectionType: connectionTypeForCredential(args.payload),
    ...args.metadata,
  });
}

export async function replaceProviderCredentialIfRevision(args: {
  userId: string;
  provider: ByokProviderId;
  payload: ProviderCredentialPayload;
  metadata: ProviderCredentialPublicMetadata;
  expectedRevision: number;
}) {
  const encrypted = encryptProviderCredential(args);
  return await fetchAuthMutation(
    api.functions.byok.internal_replaceCredentialIfRevision,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      userId: args.userId,
      provider: args.provider,
      ...encrypted,
      connectionType: connectionTypeForCredential(args.payload),
      ...args.metadata,
      expectedRevision: args.expectedRevision,
    },
  );
}
