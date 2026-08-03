import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { ApiKeyProviderCredentialPayload } from "../crypto";
import type { OAuthStartResponse } from "./types";
import { upsertProviderCredential } from "../credential-store";
import {
  deleteOAuthFlowIfOwned,
  loadOAuthFlow,
  saveOAuthFlow,
} from "./flow-store";
import { acquireRedisLease, releaseRedisLease } from "./redis-coordination";

const FLOW_TTL_MS = 15 * 60 * 1000;
const CALLBACK_LEASE_PREFIX = "redux-chat:byok:openrouter-callback:";

export async function startOpenRouterOAuth(args: {
  userId: string;
  origin: string;
}): Promise<OAuthStartResponse> {
  const flowId = randomUUID();
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  const callbackUrl = new URL(
    "/api/byok/oauth/openrouter/callback",
    args.origin,
  );
  callbackUrl.searchParams.set("flow", flowId);
  const expiresAt = Date.now() + FLOW_TTL_MS;
  await saveOAuthFlow({
    flowId,
    userId: args.userId,
    connector: "openrouter",
    flow: {
      connector: "openrouter",
      provider: "openrouter",
      codeVerifier,
      callbackUrl: callbackUrl.toString(),
      expiresAt,
    },
  });

  const authorizationUrl = new URL("https://openrouter.ai/auth");
  authorizationUrl.searchParams.set("callback_url", callbackUrl.toString());
  authorizationUrl.searchParams.set("code_challenge", codeChallenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  return {
    mode: "redirect",
    flowId,
    authorizationUrl: authorizationUrl.toString(),
    expiresAt,
  };
}

export async function completeOpenRouterOAuth(args: {
  userId: string;
  flowId: string;
  code: string;
}): Promise<void> {
  const flow = await loadOAuthFlow({
    flowId: args.flowId,
    userId: args.userId,
    connector: "openrouter",
  });
  if (flow?.connector !== "openrouter" || flow.expiresAt <= Date.now()) {
    if (flow) {
      await deleteOAuthFlowIfOwned({
        flowId: args.flowId,
        userId: args.userId,
        connector: "openrouter",
      });
    }
    throw new Error("OpenRouter authorization expired. Please try again.");
  }
  const leaseKey = `${CALLBACK_LEASE_PREFIX}${args.flowId}`;
  const leaseToken = await acquireRedisLease(leaseKey, 30_000);
  if (!leaseToken) {
    throw new Error("OpenRouter authorization is already being completed.");
  }
  try {
    const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: args.code,
        code_verifier: flow.codeVerifier,
        code_challenge_method: "S256",
      }),
    });
    const value = (await response.json().catch(() => undefined)) as unknown;
    if (!response.ok || !isRecord(value) || !nonEmptyString(value.key)) {
      throw new Error("OpenRouter token exchange failed.");
    }
    const apiKey = nonEmptyString(value.key);
    if (!apiKey) throw new Error("OpenRouter token exchange returned no key.");
    const externalUserId = nonEmptyString(value.user_id);
    const payload: ApiKeyProviderCredentialPayload = {
      version: 2,
      kind: "api_key",
      source: "openrouter_oauth",
      apiKey,
      ...(externalUserId ? { externalUserId } : {}),
    };
    await upsertProviderCredential({
      userId: args.userId,
      provider: "openrouter",
      payload,
      metadata: {
        displaySuffix: apiKey.slice(-4),
        ...(externalUserId ? { displayLabel: externalUserId } : {}),
      },
    });
    await deleteOAuthFlowIfOwned({
      flowId: args.flowId,
      userId: args.userId,
      connector: "openrouter",
    });
  } finally {
    await releaseRedisLease(leaseKey, leaseToken);
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
