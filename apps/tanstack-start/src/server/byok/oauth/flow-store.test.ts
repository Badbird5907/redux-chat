import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteOAuthFlowIfOwned,
  loadOAuthFlow,
  saveOAuthFlow,
} from "./flow-store";

const redisState = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    client: {
      set: vi.fn((key: string, value: unknown) => {
        values.set(key, value);
        return Promise.resolve("OK");
      }),
      get: vi.fn((key: string) => Promise.resolve(values.get(key))),
      del: vi.fn((key: string) => Promise.resolve(values.delete(key) ? 1 : 0)),
    },
  };
});

vi.mock("@redux/redis", () => ({ redis: () => redisState.client }));

describe("encrypted OAuth flow storage", () => {
  beforeEach(() => {
    redisState.values.clear();
  });

  it("prevents another user or connector from reading or deleting a flow", async () => {
    await saveOAuthFlow({
      flowId: "flow-1",
      userId: "user-a",
      connector: "openrouter",
      flow: {
        connector: "openrouter",
        provider: "openrouter",
        codeVerifier: "verifier-secret",
        callbackUrl:
          "https://redux.example/api/byok/oauth/openrouter/callback?flow=flow-1",
        expiresAt: Date.now() + 60_000,
      },
    });

    await expect(
      loadOAuthFlow({
        flowId: "flow-1",
        userId: "user-b",
        connector: "openrouter",
      }),
    ).resolves.toBeUndefined();
    await expect(
      loadOAuthFlow({
        flowId: "flow-1",
        userId: "user-a",
        connector: "chatgpt",
      }),
    ).resolves.toBeUndefined();
    await expect(
      deleteOAuthFlowIfOwned({
        flowId: "flow-1",
        userId: "user-b",
        connector: "openrouter",
      }),
    ).resolves.toBe(false);

    await expect(
      loadOAuthFlow({
        flowId: "flow-1",
        userId: "user-a",
        connector: "openrouter",
      }),
    ).resolves.toMatchObject({ codeVerifier: "verifier-secret" });
    await expect(
      deleteOAuthFlowIfOwned({
        flowId: "flow-1",
        userId: "user-a",
        connector: "openrouter",
      }),
    ).resolves.toBe(true);
    expect(redisState.values.size).toBe(0);
  });

  it("round-trips exchanged ChatGPT tokens for retryable completion", async () => {
    await saveOAuthFlow({
      flowId: "flow-2",
      userId: "user-a",
      connector: "chatgpt",
      flow: {
        connector: "chatgpt",
        provider: "openai",
        stage: "authorized",
        tokens: {
          accessToken: "access-token",
          refreshToken: "refresh-token",
          accountId: "account-a",
        },
        interval: 5,
        expiresAt: Date.now() + 60_000,
      },
    });

    await expect(
      loadOAuthFlow({
        flowId: "flow-2",
        userId: "user-a",
        connector: "chatgpt",
      }),
    ).resolves.toMatchObject({
      stage: "authorized",
      tokens: {
        accessToken: "access-token",
        refreshToken: "refresh-token",
        accountId: "account-a",
      },
      interval: 5,
    });
  });
});
