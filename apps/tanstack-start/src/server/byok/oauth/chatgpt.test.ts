import { beforeEach, describe, expect, it, vi } from "vitest";

import { pollChatGptOAuth, startChatGptOAuth } from "./chatgpt";

const mocks = vi.hoisted(() => ({
  requestDeviceCode: vi.fn(),
  pollDeviceCode: vi.fn(),
  exchangeDeviceAuthorization: vi.fn(),
  parseUser: vi.fn(),
  resolveConfig: vi.fn(() => ({ clientVersion: "test-version" })),
  listModels: vi.fn(),
  upsertProviderCredential: vi.fn(),
  saveOAuthFlow: vi.fn(),
  loadOAuthFlow: vi.fn(),
  deleteOAuthFlowIfOwned: vi.fn(),
  acquireRedisLease: vi.fn(),
  releaseRedisLease: vi.fn(),
  logOAuthEvent: vi.fn(),
}));

vi.mock("@opencoredev/loginwithchatgpt-core", () => ({
  requestDeviceCode: mocks.requestDeviceCode,
  pollDeviceCode: mocks.pollDeviceCode,
  exchangeDeviceAuthorization: mocks.exchangeDeviceAuthorization,
  parseUser: mocks.parseUser,
  resolveConfig: mocks.resolveConfig,
}));
vi.mock("@opencoredev/loginwithchatgpt-ai", () => ({
  createChatGPT: () => ({ listModels: mocks.listModels }),
}));
vi.mock("../credential-store", () => ({
  upsertProviderCredential: mocks.upsertProviderCredential,
}));
vi.mock("./flow-store", () => ({
  saveOAuthFlow: mocks.saveOAuthFlow,
  loadOAuthFlow: mocks.loadOAuthFlow,
  deleteOAuthFlowIfOwned: mocks.deleteOAuthFlowIfOwned,
}));
vi.mock("./redis-coordination", () => ({
  acquireRedisLease: mocks.acquireRedisLease,
  releaseRedisLease: mocks.releaseRedisLease,
}));
vi.mock("./http", () => ({ logOAuthEvent: mocks.logOAuthEvent }));

const device = {
  deviceAuthId: "device-secret",
  userCode: "ABCD-EFGH",
  verificationUrl: "https://auth.openai.example/device",
  interval: 5,
  expiresAt: Date.now() + 15 * 60_000,
};

const flow = {
  connector: "chatgpt" as const,
  provider: "openai" as const,
  device,
  expiresAt: device.expiresAt,
};

describe("ChatGPT device OAuth", () => {
  beforeEach(() => {
    mocks.requestDeviceCode.mockResolvedValue(device);
    mocks.loadOAuthFlow.mockResolvedValue(flow);
    mocks.deleteOAuthFlowIfOwned.mockResolvedValue(true);
    mocks.acquireRedisLease.mockResolvedValue("lease-token");
    mocks.pollDeviceCode.mockResolvedValue({ status: "pending" });
    mocks.exchangeDeviceAuthorization.mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      idToken: "id-token",
      accountId: "account-1234",
    });
    mocks.parseUser.mockReturnValue({
      accountId: "account-1234",
      email: "person@example.com",
      plan: "plus",
    });
    mocks.listModels.mockResolvedValue(["gpt-5.5", "gpt-5.5"]);
  });

  it("starts a 15-minute device flow without exposing device material beyond the code", async () => {
    const result = await startChatGptOAuth("user-a");

    expect(result).toMatchObject({
      mode: "device",
      userCode: device.userCode,
      verificationUrl: device.verificationUrl,
      intervalMs: 5000,
      expiresAt: device.expiresAt,
    });
    expect(mocks.saveOAuthFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        connector: "chatgpt",
        flow,
      }),
    );
    expect(JSON.stringify(result)).not.toContain(device.deviceAuthId);
  });

  it("enforces one upstream poll per provider interval", async () => {
    await expect(
      pollChatGptOAuth({ userId: "user-a", flowId: "flow-1" }),
    ).resolves.toEqual({ status: "pending", retryAfterMs: 5000 });
    expect(mocks.pollDeviceCode).toHaveBeenCalledTimes(1);
    expect(mocks.releaseRedisLease).not.toHaveBeenCalled();

    mocks.acquireRedisLease.mockResolvedValue(undefined);
    await expect(
      pollChatGptOAuth({ userId: "user-a", flowId: "flow-1" }),
    ).resolves.toEqual({ status: "pending", retryAfterMs: 5000 });
    expect(mocks.pollDeviceCode).toHaveBeenCalledTimes(1);
  });

  it("consumes the flow, discovers models, and replaces the OpenAI connection", async () => {
    mocks.pollDeviceCode.mockResolvedValue({
      status: "authorized",
      authorizationCode: "authorization-code",
      codeChallenge: "challenge",
      codeVerifier: "verifier",
    });

    await expect(
      pollChatGptOAuth({ userId: "user-a", flowId: "flow-1" }),
    ).resolves.toEqual({ status: "connected", provider: "openai" });

    expect(mocks.deleteOAuthFlowIfOwned).toHaveBeenCalledWith({
      userId: "user-a",
      flowId: "flow-1",
      connector: "chatgpt",
    });
    expect(
      mocks.deleteOAuthFlowIfOwned.mock.invocationCallOrder[0],
    ).toBeLessThan(
      mocks.exchangeDeviceAuthorization.mock.invocationCallOrder[0] ?? 0,
    );
    expect(mocks.upsertProviderCredential).toHaveBeenCalledTimes(1);
    const saved = mocks.upsertProviderCredential.mock.calls[0]?.[0] as
      | {
          userId: string;
          provider: string;
          payload: {
            version: number;
            kind: string;
            modelIds: string[];
            defaultModel: string;
          };
          metadata: {
            displaySuffix: string;
            displayLabel: string;
            availableModelIds: string[];
            supportsImageGeneration: boolean;
          };
        }
      | undefined;
    expect(saved).toMatchObject({
      userId: "user-a",
      provider: "openai",
      payload: {
        version: 2,
        kind: "chatgpt_oauth",
        modelIds: ["gpt-5.5"],
        defaultModel: "gpt-5.5",
      },
      metadata: {
        displaySuffix: "1234",
        displayLabel: "person@example.com",
        availableModelIds: ["gpt-5.5"],
        supportsImageGeneration: true,
      },
    });
  });

  it("does not overwrite an existing credential when initial discovery fails", async () => {
    mocks.pollDeviceCode.mockResolvedValue({
      status: "authorized",
      authorizationCode: "authorization-code",
      codeChallenge: "challenge",
      codeVerifier: "verifier",
    });
    mocks.listModels.mockRejectedValue(new Error("models unavailable"));

    await expect(
      pollChatGptOAuth({ userId: "user-a", flowId: "flow-1" }),
    ).rejects.toThrow("models unavailable");
    expect(mocks.deleteOAuthFlowIfOwned).toHaveBeenCalled();
    expect(mocks.upsertProviderCredential).not.toHaveBeenCalled();
  });

  it("cannot delete a flow that fails user-bound decryption", async () => {
    mocks.loadOAuthFlow.mockResolvedValue(undefined);

    await expect(
      pollChatGptOAuth({ userId: "wrong-user", flowId: "flow-1" }),
    ).resolves.toEqual({ status: "expired" });
    expect(mocks.deleteOAuthFlowIfOwned).not.toHaveBeenCalled();
  });
});
