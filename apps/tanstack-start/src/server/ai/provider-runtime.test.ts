import { beforeEach, describe, expect, it, vi } from "vitest";

import { getModelRoute } from "@redux/shared/models";

import { RUNTIME_PROVIDERS } from "./provider-runtime";

const mocks = vi.hoisted(() => ({
  createOpenAI: vi.fn(),
  openAiModel: vi.fn(),
  openAiImageModel: vi.fn(),
  createChatGPT: vi.fn(),
  chatGptResponses: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: () => vi.fn(),
}));
vi.mock("@ai-sdk/google-vertex", () => ({ createVertex: () => vi.fn() }));
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: mocks.createOpenAI }));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: () => vi.fn(),
}));
vi.mock("@openrouter/ai-sdk-provider", () => ({
  createOpenRouter: () => vi.fn(),
}));
vi.mock("@opencoredev/loginwithchatgpt-ai", () => ({
  createChatGPT: mocks.createChatGPT,
}));
vi.mock("./chatgpt-image-model", () => ({
  createChatGptImageModel: vi.fn(),
}));
vi.mock("./chatgpt-images-client", () => ({
  createChatGptImagesClient: vi.fn(),
}));
vi.mock("@/server/byok/chatgpt-refresh", () => ({
  withoutRefreshToken: (tokens: Record<string, unknown>) => {
    const { refreshToken: _refreshToken, ...requestTokens } = tokens;
    return requestTokens;
  },
}));

describe("OpenAI BYOK runtime selection", () => {
  beforeEach(() => {
    mocks.createOpenAI.mockReturnValue(
      Object.assign(mocks.openAiModel, { image: mocks.openAiImageModel }),
    );
    mocks.createChatGPT.mockReturnValue({ responses: mocks.chatGptResponses });
  });

  it("continues to use the official OpenAI provider for manual API keys", () => {
    const route = getModelRoute("openai:gpt-5.6-sol");
    if (!route) throw new Error("Missing test route");
    const runtime = RUNTIME_PROVIDERS.openai;
    if (!runtime) throw new Error("Missing OpenAI runtime");

    runtime.createModel(route, {
      version: 2,
      kind: "api_key",
      source: "manual",
      apiKey: "sk-openai",
    });

    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: "sk-openai" });
    expect(mocks.openAiModel).toHaveBeenCalledWith("gpt-5.6-sol");
    expect(mocks.createChatGPT).not.toHaveBeenCalled();
  });

  it("uses the ChatGPT Responses provider without passing its refresh token", () => {
    const route = getModelRoute("openai:gpt-5.6-sol");
    if (!route) throw new Error("Missing test route");
    const runtime = RUNTIME_PROVIDERS.openai;
    if (!runtime) throw new Error("Missing OpenAI runtime");

    runtime.createModel(route, {
      version: 2,
      kind: "chatgpt_oauth",
      tokens: {
        accessToken: "access",
        refreshToken: "refresh",
        accountId: "account-1",
      },
      profile: { accountId: "account-1" },
      modelIds: ["gpt-5.6-sol"],
      defaultModel: "gpt-5.6-sol",
    });

    expect(mocks.createChatGPT).toHaveBeenCalledWith({
      credentials: { accessToken: "access", accountId: "account-1" },
      defaultModel: "gpt-5.6-sol",
    });
    expect(mocks.chatGptResponses).toHaveBeenCalledWith("gpt-5.6-sol");
    expect(mocks.createOpenAI).not.toHaveBeenCalled();
  });

  it("rejects ChatGPT credential kinds for unrelated providers", () => {
    const route = getModelRoute("anthropic:claude-opus-4-8");
    if (!route) throw new Error("Missing test route");
    const runtime = RUNTIME_PROVIDERS.anthropic;
    if (!runtime) throw new Error("Missing Anthropic runtime");

    expect(() =>
      runtime.createModel(route, {
        version: 2,
        kind: "chatgpt_oauth",
        tokens: { accessToken: "access", accountId: "account-1" },
        profile: { accountId: "account-1" },
        modelIds: ["gpt-5.5"],
        defaultModel: "gpt-5.5",
      }),
    ).toThrow("requires API-key credentials");
  });
});
