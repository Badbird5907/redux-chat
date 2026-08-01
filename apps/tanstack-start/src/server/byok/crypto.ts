import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { ByokProviderId } from "@redux/shared/models";

import { env } from "@/env";

export interface ProviderCredentialPayload {
  apiKey: string;
  accountId?: string;
}

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
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    encryptionKeyForVersion(CURRENT_KEY_VERSION),
    iv,
  );
  cipher.setAAD(
    additionalData(CURRENT_KEY_VERSION, args.userId, args.provider),
  );
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

export function decryptProviderCredential(args: {
  userId: string;
  provider: ByokProviderId;
  encrypted: EncryptedProviderCredential;
}): ProviderCredentialPayload {
  const keyVersion = args.encrypted.keyVersion;
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKeyForVersion(keyVersion),
    Buffer.from(args.encrypted.iv, "base64"),
  );
  decipher.setAAD(additionalData(keyVersion, args.userId, args.provider));
  decipher.setAuthTag(Buffer.from(args.encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(args.encrypted.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
  const value = JSON.parse(plaintext) as unknown;
  if (!value || typeof value !== "object") {
    throw new Error("Invalid encrypted provider credential.");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.apiKey !== "string" || record.apiKey.length === 0) {
    throw new Error("Invalid encrypted provider credential.");
  }
  return {
    apiKey: record.apiKey,
    ...(typeof record.accountId === "string" && record.accountId.length > 0
      ? { accountId: record.accountId }
      : {}),
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

function additionalData(
  keyVersion: number,
  userId: string,
  provider: ByokProviderId,
): Buffer {
  return Buffer.from(`redux-chat:byok:v${keyVersion}:${userId}:${provider}`);
}
