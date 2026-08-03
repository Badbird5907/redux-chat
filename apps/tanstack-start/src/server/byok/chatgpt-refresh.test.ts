import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatGptProviderCredentialPayload } from "./crypto";
import { loadFreshChatGptCredential } from "./chatgpt-refresh";

const mocks = vi.hoisted(() => ({
  ensureFreshTokens: vi.fn(),
  isAccessTokenExpired: vi.fn(),
  isRefreshTokenInvalid: vi.fn(),
  listModels: vi.fn(),
  fetchAuthQuery: vi.fn(),
  fetchAuthMutation: vi.fn(),
  decryptProviderCredential: vi.fn(),
  replaceProviderCredentialIfRevision: vi.fn(),
  acquireRedisLease: vi.fn(),
  releaseRedisLease: vi.fn(),
}));

vi.mock("@opencoredev/loginwithchatgpt-core", () => ({
  ensureFreshTokens: mocks.ensureFreshTokens,
  isAccessTokenExpired: mocks.isAccessTokenExpired,
  isRefreshTokenInvalid: mocks.isRefreshTokenInvalid,
}));
vi.mock("@opencoredev/loginwithchatgpt-ai", () => ({
  createChatGPT: () => ({ listModels: mocks.listModels }),
}));
vi.mock("@/lib/auth/server", () => ({
  fetchAuthQuery: mocks.fetchAuthQuery,
  fetchAuthMutation: mocks.fetchAuthMutation,
}));
vi.mock("./crypto", () => ({
  decryptProviderCredential: mocks.decryptProviderCredential,
}));
vi.mock("./credential-store", () => ({
  replaceProviderCredentialIfRevision:
    mocks.replaceProviderCredentialIfRevision,
}));
vi.mock("./oauth/chatgpt", () => ({
  chatGptConfig: () => ({ clientVersion: "test-version" }),
  selectDefaultChatGptModel: (modelIds: readonly string[]) => modelIds[0],
}));
vi.mock("./oauth/redis-coordination", () => ({
  acquireRedisLease: mocks.acquireRedisLease,
  releaseRedisLease: mocks.releaseRedisLease,
}));

const expiredPayload: ChatGptProviderCredentialPayload = {
  version: 2,
  kind: "chatgpt_oauth",
  tokens: {
    accessToken: "expired-access",
    refreshToken: "refresh-token",
    accountId: "account-1",
  },
  profile: { accountId: "account-1", email: "person@example.com" },
  modelIds: ["gpt-5.5"],
  defaultModel: "gpt-5.5",
};

describe("ChatGPT credential refresh", () => {
  let stored: { payload: ChatGptProviderCredentialPayload; revision: number };

  beforeEach(() => {
    stored = { payload: structuredClone(expiredPayload), revision: 1 };
    mocks.fetchAuthQuery.mockImplementation(() =>
      Promise.resolve({
        ciphertext: "encrypted",
        iv: "iv",
        authTag: "tag",
        keyVersion: 1,
        revision: stored.revision,
        supportsImageGeneration: true,
      }),
    );
    mocks.decryptProviderCredential.mockImplementation(() => stored.payload);
    mocks.isAccessTokenExpired.mockImplementation(
      (tokens: { accessToken: string }) =>
        tokens.accessToken === "expired-access",
    );
    mocks.isRefreshTokenInvalid.mockReturnValue(false);
    mocks.acquireRedisLease.mockResolvedValue("lease-token");
    mocks.fetchAuthMutation.mockResolvedValue({ deleted: true });
    mocks.ensureFreshTokens.mockResolvedValue({
      accessToken: "fresh-access",
      refreshToken: "rotated-refresh",
      accountId: "account-1",
    });
    mocks.listModels.mockResolvedValue(["gpt-5.6-sol", "gpt-5.5"]);
    mocks.replaceProviderCredentialIfRevision.mockImplementation(
      (args: { payload: ChatGptProviderCredentialPayload }) => {
        stored = { payload: args.payload, revision: stored.revision + 1 };
        return Promise.resolve({ updated: true, revision: stored.revision });
      },
    );
  });

  it("performs only one upstream refresh for concurrent requests", async () => {
    let resolveRefresh: (
      value: ChatGptProviderCredentialPayload["tokens"],
    ) => void = () => undefined;
    mocks.ensureFreshTokens.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    mocks.acquireRedisLease
      .mockResolvedValueOnce("lease-token")
      .mockResolvedValueOnce(undefined);

    const first = loadFreshChatGptCredential({ userId: "user-a" });
    await vi.waitFor(() => expect(mocks.ensureFreshTokens).toHaveBeenCalled());
    const second = loadFreshChatGptCredential({ userId: "user-a" });
    resolveRefresh({
      accessToken: "fresh-access",
      refreshToken: "rotated-refresh",
      accountId: "account-1",
    });

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(mocks.ensureFreshTokens).toHaveBeenCalledTimes(1);
    expect(firstResult?.revision).toBe(2);
    expect(secondResult?.revision).toBe(2);
    expect(secondResult?.payload.tokens.accessToken).toBe("fresh-access");
  });

  it("updates discovered model availability after refresh", async () => {
    const result = await loadFreshChatGptCredential({ userId: "user-a" });

    expect(result?.payload.modelIds).toEqual(["gpt-5.6-sol", "gpt-5.5"]);
    expect(result?.payload.defaultModel).toBe("gpt-5.6-sol");
    const replacement = mocks.replaceProviderCredentialIfRevision.mock
      .calls[0]?.[0] as
      | {
          expectedRevision: number;
          metadata: { availableModelIds: string[] };
        }
      | undefined;
    expect(replacement).toMatchObject({
      expectedRevision: 1,
      metadata: {
        availableModelIds: ["gpt-5.6-sol", "gpt-5.5"],
      },
    });
  });

  it("conditionally deletes a connection when the refresh token is revoked", async () => {
    const revoked = new Error("revoked");
    mocks.ensureFreshTokens.mockRejectedValue(revoked);
    mocks.isRefreshTokenInvalid.mockImplementation(
      (error: unknown) => error === revoked,
    );

    await expect(
      loadFreshChatGptCredential({ userId: "user-a" }),
    ).resolves.toBeUndefined();
    expect(mocks.fetchAuthMutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "user-a",
        provider: "openai",
        expectedRevision: 1,
      }),
    );
    expect(mocks.replaceProviderCredentialIfRevision).not.toHaveBeenCalled();
  });

  it("reloads a newer ChatGPT connection when revoked-token deletion loses a revision race", async () => {
    const revoked = new Error("revoked");
    mocks.ensureFreshTokens.mockRejectedValue(revoked);
    mocks.isRefreshTokenInvalid.mockImplementation(
      (error: unknown) => error === revoked,
    );
    const newerPayload: ChatGptProviderCredentialPayload = {
      ...expiredPayload,
      tokens: {
        accessToken: "newer-access",
        refreshToken: "newer-refresh",
        accountId: "account-1",
      },
    };
    mocks.fetchAuthMutation.mockImplementation(() => {
      stored = { payload: newerPayload, revision: 2 };
      return Promise.resolve({ deleted: false });
    });

    await expect(
      loadFreshChatGptCredential({ userId: "user-a" }),
    ).resolves.toEqual({
      payload: newerPayload,
      revision: 2,
      supportsImageGeneration: true,
    });
  });

  it("preserves the stored connection on a transient refresh failure", async () => {
    mocks.ensureFreshTokens.mockRejectedValue(new Error("temporary outage"));

    await expect(
      loadFreshChatGptCredential({ userId: "user-a" }),
    ).rejects.toThrow("temporary outage");
    expect(stored).toEqual({ payload: expiredPayload, revision: 1 });
    expect(mocks.fetchAuthMutation).not.toHaveBeenCalled();
    expect(mocks.replaceProviderCredentialIfRevision).not.toHaveBeenCalled();
  });

  it("persists rotated tokens even when forced model discovery fails", async () => {
    mocks.listModels.mockRejectedValue(new Error("models unavailable"));

    await expect(
      loadFreshChatGptCredential({ userId: "user-a", forceDiscovery: true }),
    ).rejects.toThrow("models unavailable");
    expect(stored.revision).toBe(2);
    expect(stored.payload.tokens).toMatchObject({
      accessToken: "fresh-access",
      refreshToken: "rotated-refresh",
    });
    expect(stored.payload.modelIds).toEqual(["gpt-5.5"]);
  });

  it("reports forced discovery failure when the conditional write loses a revision race", async () => {
    mocks.listModels.mockRejectedValue(new Error("models unavailable"));
    mocks.replaceProviderCredentialIfRevision.mockResolvedValue({
      updated: false,
      revision: 2,
    });

    await expect(
      loadFreshChatGptCredential({ userId: "user-a", forceDiscovery: true }),
    ).rejects.toThrow("models unavailable");
    expect(stored).toEqual({ payload: expiredPayload, revision: 1 });
  });
});
