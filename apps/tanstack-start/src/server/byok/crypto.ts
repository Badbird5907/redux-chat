import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { ChatGPTTokens } from "@opencoredev/loginwithchatgpt-core";

import type { ByokProviderId } from "@redux/shared/models";

import { env } from "@/env";

export type ProviderCredentialConnectionType =
  | "api_key"
  | "chatgpt_oauth"
  | "openrouter_oauth";

export interface ApiKeyProviderCredentialPayload {
  version: 2;
  kind: "api_key";
  source: "manual" | "openrouter_oauth";
  apiKey: string;
  accountId?: string;
  externalUserId?: string;
}

export interface ChatGptProviderCredentialPayload {
  version: 2;
  kind: "chatgpt_oauth";
  tokens: ChatGPTTokens;
  profile: {
    accountId: string;
    email?: string;
    name?: string;
    plan?: string;
  };
  modelIds: string[];
  defaultModel: string;
}

export type ProviderCredentialPayload =
  | ApiKeyProviderCredentialPayload
  | ChatGptProviderCredentialPayload;

export interface EncryptedProviderCredential {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

const CURRENT_KEY_VERSION = 1;

export function encryptProviderCredential(args: {
  userId: string;
  provider: ByokProviderId;
  payload: ProviderCredentialPayload;
}): EncryptedProviderCredential {
  return encryptByokSecret({
    additionalData: credentialAdditionalData(
      CURRENT_KEY_VERSION,
      args.userId,
      args.provider,
    ),
    payload: args.payload,
  });
}

export function decryptProviderCredential(args: {
  userId: string;
  provider: ByokProviderId;
  encrypted: EncryptedProviderCredential;
}): ProviderCredentialPayload {
  const value = decryptByokSecret({
    additionalData: credentialAdditionalData(
      args.encrypted.keyVersion,
      args.userId,
      args.provider,
    ),
    encrypted: args.encrypted,
  });
  return parseProviderCredential(value);
}

export function encryptByokSecret(args: {
  additionalData: string;
  payload: unknown;
}): EncryptedProviderCredential {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    encryptionKeyForVersion(CURRENT_KEY_VERSION),
    iv,
  );
  cipher.setAAD(Buffer.from(args.additionalData));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(args.payload), "utf8"),
    cipher.final(),
  ]);
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptByokSecret(args: {
  additionalData: string;
  encrypted: EncryptedProviderCredential;
}): unknown {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKeyForVersion(args.encrypted.keyVersion),
    Buffer.from(args.encrypted.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(args.additionalData));
  decipher.setAuthTag(Buffer.from(args.encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(args.encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(plaintext) as unknown;
}

export function connectionTypeForCredential(
  payload: ProviderCredentialPayload,
): ProviderCredentialConnectionType {
  if (payload.kind === "chatgpt_oauth") {
    return "chatgpt_oauth";
  }
  return payload.source === "openrouter_oauth" ? "openrouter_oauth" : "api_key";
}

function parseProviderCredential(value: unknown): ProviderCredentialPayload {
  if (!isRecord(value)) {
    throw new Error("Invalid encrypted provider credential.");
  }

  if (value.version === 2 && value.kind === "api_key") {
    const apiKey = nonEmptyString(value.apiKey);
    const source = value.source;
    if (!apiKey || (source !== "manual" && source !== "openrouter_oauth")) {
      throw new Error("Invalid encrypted provider credential.");
    }
    return {
      version: 2,
      kind: "api_key",
      source,
      apiKey,
      ...(nonEmptyString(value.accountId)
        ? { accountId: nonEmptyString(value.accountId) }
        : {}),
      ...(nonEmptyString(value.externalUserId)
        ? { externalUserId: nonEmptyString(value.externalUserId) }
        : {}),
    };
  }

  if (value.version === 2 && value.kind === "chatgpt_oauth") {
    const tokens = parseChatGptTokens(value.tokens);
    const profile = parseChatGptProfile(value.profile);
    const defaultModel = nonEmptyString(value.defaultModel);
    const modelIds = Array.isArray(value.modelIds)
      ? value.modelIds.filter(
          (item): item is string => typeof item === "string" && item.length > 0,
        )
      : [];
    if (!tokens || !profile || !defaultModel || modelIds.length === 0) {
      throw new Error("Invalid encrypted provider credential.");
    }
    return {
      version: 2,
      kind: "chatgpt_oauth",
      tokens,
      profile,
      modelIds: Array.from(new Set(modelIds)),
      defaultModel,
    };
  }

  // Legacy version 1 payload: { apiKey, accountId? }.
  const legacyApiKey = nonEmptyString(value.apiKey);
  if (!legacyApiKey) {
    throw new Error("Invalid encrypted provider credential.");
  }
  return {
    version: 2,
    kind: "api_key",
    source: "manual",
    apiKey: legacyApiKey,
    ...(nonEmptyString(value.accountId)
      ? { accountId: nonEmptyString(value.accountId) }
      : {}),
  };
}

function parseChatGptTokens(value: unknown): ChatGPTTokens | undefined {
  if (!isRecord(value)) return undefined;
  const accessToken = nonEmptyString(value.accessToken);
  if (!accessToken) return undefined;
  return {
    accessToken,
    ...(nonEmptyString(value.refreshToken)
      ? { refreshToken: nonEmptyString(value.refreshToken) }
      : {}),
    ...(nonEmptyString(value.idToken)
      ? { idToken: nonEmptyString(value.idToken) }
      : {}),
    ...(nonEmptyString(value.accountId)
      ? { accountId: nonEmptyString(value.accountId) }
      : {}),
    ...(typeof value.expiresAt === "number"
      ? { expiresAt: value.expiresAt }
      : {}),
  };
}

function parseChatGptProfile(
  value: unknown,
): ChatGptProviderCredentialPayload["profile"] | undefined {
  if (!isRecord(value)) return undefined;
  const accountId = nonEmptyString(value.accountId);
  if (!accountId) return undefined;
  return {
    accountId,
    ...(nonEmptyString(value.email)
      ? { email: nonEmptyString(value.email) }
      : {}),
    ...(nonEmptyString(value.name) ? { name: nonEmptyString(value.name) } : {}),
    ...(nonEmptyString(value.plan) ? { plan: nonEmptyString(value.plan) } : {}),
  };
}

function encryptionKeyForVersion(keyVersion: number): Buffer {
  const encodedKey = (() => {
    switch (keyVersion) {
      case 1:
        return env.BYOK_ENCRYPTION_KEY;
      default:
        throw new Error("Unsupported BYOK encryption key version.");
    }
  })();
  const key = Buffer.from(encodedKey, "base64");
  if (key.byteLength !== 32) {
    throw new Error("BYOK_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }
  return key;
}

function credentialAdditionalData(
  keyVersion: number,
  userId: string,
  provider: ByokProviderId,
): string {
  return `redux-chat:byok:v${keyVersion}:${userId}:${provider}`;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
