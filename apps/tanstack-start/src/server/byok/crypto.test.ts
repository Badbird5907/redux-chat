import { describe, expect, it } from "vitest";

import {
  decryptByokSecret,
  decryptProviderCredential,
  encryptByokSecret,
  encryptProviderCredential,
} from "./crypto";

describe("BYOK credential encryption", () => {
  it("round-trips version 2 API-key and ChatGPT credentials", () => {
    const apiKey = {
      version: 2 as const,
      kind: "api_key" as const,
      source: "openrouter_oauth" as const,
      apiKey: "sk-or-secret",
      externalUserId: "user-123",
    };
    const encryptedApiKey = encryptProviderCredential({
      userId: "user-a",
      provider: "openrouter",
      payload: apiKey,
    });
    expect(
      decryptProviderCredential({
        userId: "user-a",
        provider: "openrouter",
        encrypted: encryptedApiKey,
      }),
    ).toEqual(apiKey);

    const chatGpt = {
      version: 2 as const,
      kind: "chatgpt_oauth" as const,
      tokens: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accountId: "account-123",
        expiresAt: 2_000_000_000_000,
      },
      profile: {
        accountId: "account-123",
        email: "person@example.com",
        plan: "plus",
      },
      modelIds: ["gpt-5.5", "gpt-5.5"],
      defaultModel: "gpt-5.5",
    };
    const encryptedChatGpt = encryptProviderCredential({
      userId: "user-a",
      provider: "openai",
      payload: chatGpt,
    });
    expect(
      decryptProviderCredential({
        userId: "user-a",
        provider: "openai",
        encrypted: encryptedChatGpt,
      }),
    ).toEqual({
      ...chatGpt,
      modelIds: ["gpt-5.5"],
    });
  });

  it("normalizes legacy API-key payloads lazily", () => {
    const encrypted = encryptByokSecret({
      additionalData: "redux-chat:byok:v1:user-a:workersai",
      payload: { apiKey: "legacy-key", accountId: "account-a" },
    });

    expect(
      decryptProviderCredential({
        userId: "user-a",
        provider: "workersai",
        encrypted,
      }),
    ).toEqual({
      version: 2,
      kind: "api_key",
      source: "manual",
      apiKey: "legacy-key",
      accountId: "account-a",
    });
  });

  it("binds ciphertext to the Redux Chat user and provider", () => {
    const encrypted = encryptProviderCredential({
      userId: "user-a",
      provider: "openai",
      payload: {
        version: 2,
        kind: "api_key",
        source: "manual",
        apiKey: "secret",
      },
    });

    expect(() =>
      decryptProviderCredential({
        userId: "user-b",
        provider: "openai",
        encrypted,
      }),
    ).toThrow();
    expect(() =>
      decryptProviderCredential({
        userId: "user-a",
        provider: "openrouter",
        encrypted,
      }),
    ).toThrow();
  });

  it("binds generic OAuth secrets to their separate AAD", () => {
    const encrypted = encryptByokSecret({
      additionalData: "flow:user-a:chatgpt:flow-1",
      payload: { deviceAuthId: "device-secret" },
    });

    expect(
      decryptByokSecret({
        additionalData: "flow:user-a:chatgpt:flow-1",
        encrypted,
      }),
    ).toEqual({ deviceAuthId: "device-secret" });
    expect(() =>
      decryptByokSecret({
        additionalData: "flow:user-b:chatgpt:flow-1",
        encrypted,
      }),
    ).toThrow();
    expect(() =>
      decryptByokSecret({
        additionalData: "flow:user-a:openrouter:flow-1",
        encrypted,
      }),
    ).toThrow();
  });
});
