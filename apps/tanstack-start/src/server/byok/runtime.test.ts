import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MODEL_ROUTING_CONFIG } from "@redux/shared/models";

import { loadByokRuntimeContext } from "./runtime";

const mocks = vi.hoisted(() => ({
  decryptProviderCredential: vi.fn(),
  fetchAuthMutation: vi.fn(),
  fetchAuthQuery: vi.fn(),
  loadFreshChatGptCredential: vi.fn(),
}));

vi.mock("@redux/backend/convex/_generated/api", () => ({
  api: {
    functions: {
      byok: {
        internal_getEncryptedBundle: {},
        internal_reconcileUser: {},
      },
    },
  },
}));
vi.mock("@/env", () => ({
  env: { INTERNAL_CONVEX_SECRET: "internal-secret" },
}));
vi.mock("@/lib/auth/server", () => ({
  fetchAuthMutation: mocks.fetchAuthMutation,
  fetchAuthQuery: mocks.fetchAuthQuery,
}));
vi.mock("./chatgpt-refresh", () => ({
  loadFreshChatGptCredential: mocks.loadFreshChatGptCredential,
}));
vi.mock("./crypto", () => ({
  decryptProviderCredential: mocks.decryptProviderCredential,
}));

const chatGptCredential = {
  version: 2 as const,
  kind: "chatgpt_oauth" as const,
  tokens: {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    accountId: "account-a",
    expiresAt: 0,
  },
  profile: { accountId: "account-a" },
  modelIds: ["gpt-5.5"],
  defaultModel: "gpt-5.5",
};

describe("BYOK runtime credential preparation", () => {
  beforeEach(() => {
    mocks.fetchAuthMutation.mockResolvedValue({ ok: true });
    mocks.fetchAuthQuery.mockResolvedValue({
      credentials: [
        {
          provider: "openai",
          ciphertext: "ciphertext",
          iv: "iv",
          authTag: "auth-tag",
          keyVersion: 1,
          displaySuffix: "ount",
          connectionType: "chatgpt_oauth",
          supportsImageGeneration: true,
          revision: 1,
        },
      ],
      routing: DEFAULT_MODEL_ROUTING_CONFIG,
    });
    mocks.decryptProviderCredential.mockReturnValue(chatGptCredential);
    mocks.loadFreshChatGptCredential.mockResolvedValue({
      payload: chatGptCredential,
      revision: 2,
      supportsImageGeneration: true,
    });
  });

  it("uses refreshed ChatGPT image capability with refreshed model availability", async () => {
    mocks.fetchAuthQuery.mockResolvedValue({
      credentials: [
        {
          provider: "openai",
          ciphertext: "ciphertext",
          iv: "iv",
          authTag: "auth-tag",
          keyVersion: 1,
          displaySuffix: "ount",
          connectionType: "chatgpt_oauth",
          supportsImageGeneration: false,
          revision: 1,
        },
      ],
      routing: DEFAULT_MODEL_ROUTING_CONFIG,
    });

    const result = await loadByokRuntimeContext("user-a");

    expect(result.availability.get("openai")).toMatchObject({
      kind: "models",
      supportsImageGeneration: true,
    });
  });

  it("propagates transient ChatGPT refresh failures instead of silently falling back", async () => {
    mocks.loadFreshChatGptCredential.mockRejectedValue(
      new Error("temporary refresh failure"),
    );

    await expect(loadByokRuntimeContext("user-a")).rejects.toThrow(
      "temporary refresh failure",
    );
  });

  it("still skips an independently malformed encrypted credential", async () => {
    mocks.decryptProviderCredential.mockImplementation(() => {
      throw new Error("invalid ciphertext");
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await loadByokRuntimeContext("user-a");

    expect(result.credentials.size).toBe(0);
    expect(result.availability.size).toBe(0);
    expect(consoleError).toHaveBeenCalledWith(
      "Failed to decrypt BYOK credential",
      expect.objectContaining({ provider: "openai" }),
    );
  });
});
