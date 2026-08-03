import { createChatGPT } from "@opencoredev/loginwithchatgpt-ai";
import {
  ensureFreshTokens,
  isAccessTokenExpired,
  isRefreshTokenInvalid,
} from "@opencoredev/loginwithchatgpt-core";

import { api } from "@redux/backend/convex/_generated/api";

import type { ChatGptProviderCredentialPayload } from "./crypto";
import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { replaceProviderCredentialIfRevision } from "./credential-store";
import { decryptProviderCredential } from "./crypto";
import { chatGptConfig, selectDefaultChatGptModel } from "./oauth/chatgpt";
import {
  acquireRedisLease,
  releaseRedisLease,
} from "./oauth/redis-coordination";

const REFRESH_LEASE_PREFIX = "redux-chat:byok:chatgpt-refresh:";
const REFRESH_LEASE_MS = 30_000;

export interface LoadedChatGptCredential {
  payload: ChatGptProviderCredentialPayload;
  revision: number;
  supportsImageGeneration: boolean;
}

export async function loadFreshChatGptCredential(args: {
  userId: string;
  forceDiscovery?: boolean;
}): Promise<LoadedChatGptCredential | undefined> {
  const initial = await loadCredential(args.userId);
  if (!initial) return undefined;
  if (!args.forceDiscovery && !isAccessTokenExpired(initial.payload.tokens)) {
    return initial;
  }

  const leaseKey = `${REFRESH_LEASE_PREFIX}${args.userId}`;
  const leaseToken = await acquireRedisLease(leaseKey, REFRESH_LEASE_MS);
  if (!leaseToken) {
    return await waitForRefresh(args.userId, initial.revision);
  }

  try {
    const current = await loadCredential(args.userId);
    if (!current) return undefined;
    if (!args.forceDiscovery && !isAccessTokenExpired(current.payload.tokens)) {
      return current;
    }

    let tokens;
    try {
      tokens = await ensureFreshTokens(chatGptConfig(), current.payload.tokens);
    } catch (error) {
      if (isRefreshTokenInvalid(error)) {
        const result = await fetchAuthMutation(
          api.functions.byok.internal_deleteCredentialIfRevision,
          {
            secret: env.INTERNAL_CONVEX_SECRET,
            userId: args.userId,
            provider: "openai",
            expectedRevision: current.revision,
          },
        );
        return result.deleted ? undefined : await loadCredential(args.userId);
      }
      throw error;
    }

    let modelIds = current.payload.modelIds;
    let discoveryError: unknown;
    try {
      const provider = createChatGPT({
        credentials: withoutRefreshToken(tokens),
      });
      const discovered = Array.from(
        new Set(
          (await provider.listModels()).filter((model) => model.length > 0),
        ),
      );
      if (discovered.length > 0) {
        modelIds = discovered;
      }
    } catch (error) {
      discoveryError = error;
      console.error("Failed to refresh ChatGPT model availability", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }

    const payload: ChatGptProviderCredentialPayload = {
      ...current.payload,
      tokens,
      modelIds,
      defaultModel: selectDefaultChatGptModel(modelIds),
    };
    const result = await replaceProviderCredentialIfRevision({
      userId: args.userId,
      provider: "openai",
      payload,
      metadata: {
        displaySuffix: payload.profile.accountId.slice(-4),
        displayLabel:
          payload.profile.email ?? payload.profile.name ?? payload.profile.plan,
        availableModelIds: modelIds,
        supportsImageGeneration: true,
      },
      expectedRevision: current.revision,
    });
    if (args.forceDiscovery && discoveryError) {
      throw discoveryError instanceof Error
        ? discoveryError
        : new Error("ChatGPT model discovery failed.", {
            cause: discoveryError,
          });
    }
    if (!result.updated) {
      return await loadCredential(args.userId);
    }
    return {
      payload,
      revision: result.revision,
      supportsImageGeneration: true,
    };
  } finally {
    await releaseRedisLease(leaseKey, leaseToken);
  }
}

export function withoutRefreshToken(
  tokens: ChatGptProviderCredentialPayload["tokens"],
): ChatGptProviderCredentialPayload["tokens"] {
  const { refreshToken: _refreshToken, ...requestTokens } = tokens;
  return requestTokens;
}

async function loadCredential(
  userId: string,
): Promise<LoadedChatGptCredential | undefined> {
  const encrypted = await fetchAuthQuery(
    api.functions.byok.internal_getEncryptedCredential,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      userId,
      provider: "openai",
    },
  );
  if (!encrypted) return undefined;
  const payload = decryptProviderCredential({
    userId,
    provider: "openai",
    encrypted,
  });
  return payload.kind === "chatgpt_oauth"
    ? {
        payload,
        revision: encrypted.revision,
        supportsImageGeneration: encrypted.supportsImageGeneration === true,
      }
    : undefined;
}

async function waitForRefresh(
  userId: string,
  initialRevision: number,
): Promise<LoadedChatGptCredential | undefined> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    const current = await loadCredential(userId);
    if (!current) return undefined;
    if (
      current.revision !== initialRevision &&
      !isAccessTokenExpired(current.payload.tokens)
    ) {
      return current;
    }
  }
  throw new Error("ChatGPT credentials are being refreshed. Please retry.");
}
