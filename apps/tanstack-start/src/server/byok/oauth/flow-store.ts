import { redis as getRedis } from "@redux/redis";

import type { EncryptedProviderCredential } from "../crypto";
import type { ByokOAuthConnectorId, StoredOAuthFlow } from "./types";
import { decryptByokSecret, encryptByokSecret } from "../crypto";

const FLOW_KEY_PREFIX = "redux-chat:byok:oauth-flow:";

export async function saveOAuthFlow(args: {
  flowId: string;
  userId: string;
  connector: ByokOAuthConnectorId;
  flow: StoredOAuthFlow;
}): Promise<void> {
  const ttlMs = Math.max(1, args.flow.expiresAt - Date.now());
  const encrypted = encryptByokSecret({
    additionalData: flowAdditionalData(args),
    payload: args.flow,
  });
  await getRedis().set(flowKey(args.flowId), encrypted, { px: ttlMs });
}

export async function loadOAuthFlow(args: {
  flowId: string;
  userId: string;
  connector: ByokOAuthConnectorId;
}): Promise<StoredOAuthFlow | undefined> {
  const encrypted = await getRedis().get<EncryptedProviderCredential>(
    flowKey(args.flowId),
  );
  if (!encrypted) return undefined;
  try {
    const flow = decryptByokSecret({
      additionalData: flowAdditionalData(args),
      encrypted,
    });
    return parseStoredOAuthFlow(flow, args.connector);
  } catch {
    return undefined;
  }
}

export async function deleteOAuthFlowIfOwned(args: {
  flowId: string;
  userId: string;
  connector: ByokOAuthConnectorId;
}): Promise<boolean> {
  const flow = await loadOAuthFlow(args);
  if (!flow) return false;
  await getRedis().del(flowKey(args.flowId));
  return true;
}

function flowKey(flowId: string): string {
  return `${FLOW_KEY_PREFIX}${flowId}`;
}

function flowAdditionalData(args: {
  flowId: string;
  userId: string;
  connector: ByokOAuthConnectorId;
}): string {
  return `redux-chat:byok-oauth-flow:v1:${args.userId}:${args.connector}:${args.flowId}`;
}

function parseStoredOAuthFlow(
  value: unknown,
  connector: ByokOAuthConnectorId,
): StoredOAuthFlow | undefined {
  if (!isRecord(value) || value.connector !== connector) return undefined;
  if (connector === "chatgpt") {
    if (value.stage === "authorized") {
      const tokens = parseChatGptTokens(value.tokens);
      if (
        value.provider !== "openai" ||
        !tokens?.accountId ||
        typeof value.interval !== "number" ||
        typeof value.expiresAt !== "number"
      ) {
        return undefined;
      }
      return {
        connector,
        provider: "openai",
        stage: "authorized",
        tokens,
        interval: value.interval,
        expiresAt: value.expiresAt,
      };
    }
    const device = value.device;
    if (
      value.provider !== "openai" ||
      !isRecord(device) ||
      typeof device.deviceAuthId !== "string" ||
      typeof device.userCode !== "string" ||
      typeof device.verificationUrl !== "string" ||
      typeof device.interval !== "number" ||
      typeof device.expiresAt !== "number" ||
      typeof value.expiresAt !== "number"
    ) {
      return undefined;
    }
    return {
      connector,
      provider: "openai",
      stage: "device",
      device: {
        deviceAuthId: device.deviceAuthId,
        userCode: device.userCode,
        verificationUrl: device.verificationUrl,
        interval: device.interval,
        expiresAt: device.expiresAt,
      },
      expiresAt: value.expiresAt,
    };
  }
  if (
    value.provider !== "openrouter" ||
    typeof value.codeVerifier !== "string" ||
    typeof value.callbackUrl !== "string" ||
    typeof value.expiresAt !== "number"
  ) {
    return undefined;
  }
  return {
    connector,
    provider: "openrouter",
    codeVerifier: value.codeVerifier,
    callbackUrl: value.callbackUrl,
    expiresAt: value.expiresAt,
  };
}

function parseChatGptTokens(
  value: unknown,
): Extract<StoredOAuthFlow, { stage: "authorized" }>["tokens"] | undefined {
  if (!isRecord(value) || typeof value.accessToken !== "string") {
    return undefined;
  }
  return {
    accessToken: value.accessToken,
    ...(typeof value.refreshToken === "string"
      ? { refreshToken: value.refreshToken }
      : {}),
    ...(typeof value.idToken === "string" ? { idToken: value.idToken } : {}),
    ...(typeof value.accountId === "string"
      ? { accountId: value.accountId }
      : {}),
    ...(typeof value.expiresAt === "number"
      ? { expiresAt: value.expiresAt }
      : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
