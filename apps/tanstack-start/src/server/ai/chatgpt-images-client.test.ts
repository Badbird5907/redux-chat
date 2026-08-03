import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChatGPTImageError,
  createChatGptImagesClient,
} from "./chatgpt-images-client";

const mocks = vi.hoisted(() => ({
  codexFetch: vi.fn<(input: string, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock("@opencoredev/loginwithchatgpt-core", () => ({
  createCodexFetch: () => mocks.codexFetch,
}));
vi.mock("@/server/byok/oauth/chatgpt", () => ({
  chatGptConfig: () => ({
    codexBaseUrl: "https://chatgpt.example/backend-api/codex",
  }),
}));

describe("ChatGPT image transport", () => {
  beforeEach(() => {
    mocks.codexFetch.mockImplementation(() =>
      Promise.resolve(
        Response.json({
          output: [
            {
              type: "image_generation_call",
              id: "image-1",
              result: "base64-result",
              revised_prompt: "A revised prompt",
            },
          ],
        }),
      ),
    );
  });

  it("maps edit inputs, masks, and image tool options onto Responses", async () => {
    const client = createChatGptImagesClient({
      tokens: { accessToken: "access", accountId: "account-1" },
      defaultModel: "gpt-5.5",
    });

    const result = await client.edit({
      prompt: "Add a scarf",
      images: [
        { data: "source-base64", mediaType: "image/png", detail: "high" },
      ],
      mask: { data: new Uint8Array([1, 2, 3]), mediaType: "image/png" },
      imageModel: "gpt-image-2",
      size: "1024x1024",
      quality: "high",
      format: "jpeg",
      compression: 70,
      background: "opaque",
      inputFidelity: "high",
      partialImages: 2,
      n: 1,
    });

    const call = mocks.codexFetch.mock.calls[0];
    if (!call) throw new Error("Expected a ChatGPT image request");
    const [url, init] = call;
    expect(url).toBe("https://chatgpt.example/backend-api/codex/responses");
    if (typeof init?.body !== "string") {
      throw new Error("Expected a JSON request body");
    }
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-5.5",
      stream: true,
      tool_choice: { type: "image_generation" },
      tools: [
        {
          type: "image_generation",
          action: "edit",
          model: "gpt-image-2",
          size: "1024x1024",
          quality: "high",
          output_format: "jpeg",
          output_compression: 70,
          background: "opaque",
          partial_images: 2,
          input_fidelity: "high",
          input_image_mask: {
            image_url: "data:image/png;base64,AQID",
          },
        },
      ],
    });
    expect(body.input).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Add a scarf" },
          {
            type: "input_image",
            image_url: "data:image/png;base64,source-base64",
            detail: "high",
          },
        ],
      },
    ]);
    expect(result.data).toEqual([
      {
        base64: "base64-result",
        mediaType: "image/jpeg",
        id: "image-1",
        revisedPrompt: "A revised prompt",
      },
    ]);
  });

  it("makes one request per requested image", async () => {
    const client = createChatGptImagesClient({
      tokens: { accessToken: "access", accountId: "account-1" },
      defaultModel: "gpt-5.5",
    });

    await expect(
      client.generate({ prompt: "Otter", n: 3 }),
    ).resolves.toHaveProperty("data", expect.any(Array));
    expect(mocks.codexFetch).toHaveBeenCalledTimes(3);
  });

  it("returns a typed transport error without exposing the upstream body in its message", async () => {
    mocks.codexFetch.mockResolvedValue(
      new Response("secret upstream diagnostic", { status: 502 }),
    );
    const client = createChatGptImagesClient({
      tokens: { accessToken: "access", accountId: "account-1" },
      defaultModel: "gpt-5.5",
    });

    let error: unknown;
    try {
      await client.generate({ prompt: "Otter" });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ChatGPTImageError);
    expect(error).toMatchObject({
      status: 502,
      body: "secret upstream diagnostic",
      message: "ChatGPT image generation failed (502).",
    });
  });
});
