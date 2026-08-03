import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { completeOpenRouterOAuth, startOpenRouterOAuth } from "./openrouter";

const mocks = vi.hoisted(() => ({
  saveOAuthFlow: vi.fn(),
  loadOAuthFlow: vi.fn(),
  deleteOAuthFlowIfOwned: vi.fn(),
  upsertProviderCredential: vi.fn(),
  acquireRedisLease: vi.fn(),
  releaseRedisLease: vi.fn(),
}));

vi.mock("./flow-store", () => ({
  saveOAuthFlow: mocks.saveOAuthFlow,
  loadOAuthFlow: mocks.loadOAuthFlow,
  deleteOAuthFlowIfOwned: mocks.deleteOAuthFlowIfOwned,
}));
vi.mock("../credential-store", () => ({
  upsertProviderCredential: mocks.upsertProviderCredential,
}));
vi.mock("./redis-coordination", () => ({
  acquireRedisLease: mocks.acquireRedisLease,
  releaseRedisLease: mocks.releaseRedisLease,
}));

describe("OpenRouter OAuth PKCE", () => {
  beforeEach(() => {
    mocks.acquireRedisLease.mockResolvedValue("lease-token");
    mocks.deleteOAuthFlowIfOwned.mockResolvedValue(true);
  });

  it("creates an S256 authorization URL and stores only the verifier server-side", async () => {
    const result = await startOpenRouterOAuth({
      userId: "user-a",
      origin: "https://redux.example",
    });

    expect(result.mode).toBe("redirect");
    if (result.mode !== "redirect") throw new Error("Expected redirect mode");
    const stored = mocks.saveOAuthFlow.mock.calls[0]?.[0] as
      | {
          userId: string;
          connector: string;
          flow: { codeVerifier: string; callbackUrl: string };
        }
      | undefined;
    if (!stored) throw new Error("Expected an OAuth flow to be stored");
    expect(stored).toMatchObject({
      userId: "user-a",
      connector: "openrouter",
      flow: {
        connector: "openrouter",
        provider: "openrouter",
      },
    });
    const verifier = stored.flow.codeVerifier;
    const expectedChallenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    const authorizationUrl = new URL(result.authorizationUrl);
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      "https://openrouter.ai/auth",
    );
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(
      expectedChallenge,
    );
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(authorizationUrl.searchParams.get("callback_url")).toBe(
      stored.flow.callbackUrl,
    );
  });

  it("exchanges the callback code and stores an ordinary OpenRouter API key", async () => {
    mocks.loadOAuthFlow.mockResolvedValue({
      connector: "openrouter",
      provider: "openrouter",
      codeVerifier: "verifier-secret",
      callbackUrl:
        "https://redux.example/api/byok/oauth/openrouter/callback?flow=flow-1",
      expiresAt: Date.now() + 60_000,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ key: "sk-or-generated", user_id: "or-user" }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await completeOpenRouterOAuth({
      userId: "user-a",
      flowId: "flow-1",
      code: "authorization-code",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/auth/keys",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          code: "authorization-code",
          code_verifier: "verifier-secret",
          code_challenge_method: "S256",
        }),
      }),
    );
    expect(mocks.upsertProviderCredential).toHaveBeenCalledWith({
      userId: "user-a",
      provider: "openrouter",
      payload: {
        version: 2,
        kind: "api_key",
        source: "openrouter_oauth",
        apiKey: "sk-or-generated",
        externalUserId: "or-user",
      },
      metadata: {
        displaySuffix: "ated",
        displayLabel: "or-user",
      },
    });
    expect(mocks.deleteOAuthFlowIfOwned).toHaveBeenCalledWith({
      flowId: "flow-1",
      userId: "user-a",
      connector: "openrouter",
    });
  });

  it("leaves the previous credential untouched when ownership or exchange fails", async () => {
    mocks.loadOAuthFlow.mockResolvedValue(undefined);
    await expect(
      completeOpenRouterOAuth({
        userId: "wrong-user",
        flowId: "flow-1",
        code: "code",
      }),
    ).rejects.toThrow("expired");
    expect(mocks.deleteOAuthFlowIfOwned).not.toHaveBeenCalled();
    expect(mocks.upsertProviderCredential).not.toHaveBeenCalled();

    mocks.loadOAuthFlow.mockResolvedValue({
      connector: "openrouter",
      provider: "openrouter",
      codeVerifier: "verifier-secret",
      callbackUrl: "https://redux.example/callback",
      expiresAt: Date.now() + 60_000,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "invalid code" }, { status: 400 }),
        ),
    );
    await expect(
      completeOpenRouterOAuth({
        userId: "user-a",
        flowId: "flow-1",
        code: "bad-code",
      }),
    ).rejects.toThrow("exchange failed");
    expect(mocks.upsertProviderCredential).not.toHaveBeenCalled();
  });

  it("rejects a second concurrent completion while the flow lease is held", async () => {
    mocks.loadOAuthFlow.mockResolvedValue({
      connector: "openrouter",
      provider: "openrouter",
      codeVerifier: "verifier-secret",
      callbackUrl: "https://redux.example/callback",
      expiresAt: Date.now() + 60_000,
    });
    mocks.acquireRedisLease.mockResolvedValue(undefined);

    await expect(
      completeOpenRouterOAuth({
        userId: "user-a",
        flowId: "flow-1",
        code: "code",
      }),
    ).rejects.toThrow("already being completed");
  });
});
