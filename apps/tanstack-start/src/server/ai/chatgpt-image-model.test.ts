import { describe, expect, it, vi } from "vitest";

import {
  createChatGptImageModel,
  parseChatGptImageProviderOptions,
} from "./chatgpt-image-model";
import { ChatGPTImageError } from "./chatgpt-images-client";

vi.mock("@/server/byok/oauth/chatgpt", () => ({
  chatGptConfig: () => ({
    codexBaseUrl: "https://chatgpt.example/backend-api/codex",
  }),
}));

function callOptions(
  overrides: Partial<
    Parameters<ReturnType<typeof createChatGptImageModel>["doGenerate"]>[0]
  > = {},
) {
  return {
    prompt: "Draw an otter",
    n: 1,
    size: undefined,
    aspectRatio: undefined,
    seed: undefined,
    files: undefined,
    mask: undefined,
    providerOptions: {},
    ...overrides,
  };
}

describe("ChatGPT ImageModelV4 adapter", () => {
  it("maps text-to-image calls and returns base64 plus provider metadata", async () => {
    const generate = vi.fn().mockResolvedValue({
      data: [
        {
          base64: "base64-image-a",
          mediaType: "image/webp",
          id: "image-a",
          revisedPrompt: "A detailed otter",
        },
        {
          base64: "base64-image-b",
          mediaType: "image/webp",
          id: "image-b",
        },
      ],
    });
    const edit = vi.fn();
    const controller = new AbortController();
    const model = createChatGptImageModel({
      images: { generate, edit },
      modelId: "gpt-image-2",
      defaultModel: "gpt-5.5",
    });

    const result = await model.doGenerate(
      callOptions({
        n: 2,
        size: "1024x1536",
        abortSignal: controller.signal,
        providerOptions: {
          chatgpt: {
            quality: "high",
            format: "webp",
            compression: 80,
            background: "opaque",
            partialImages: 2,
          },
        },
      }),
    );

    expect(generate).toHaveBeenCalledWith({
      prompt: "Draw an otter",
      model: "gpt-5.5",
      imageModel: "gpt-image-2",
      n: 2,
      size: "1024x1536",
      signal: controller.signal,
      quality: "high",
      format: "webp",
      compression: 80,
      background: "opaque",
      partialImages: 2,
    });
    expect(edit).not.toHaveBeenCalled();
    expect(result.images).toEqual(["base64-image-a", "base64-image-b"]);
    expect(result.providerMetadata).toEqual({
      chatgpt: {
        images: [
          {
            id: "image-a",
            mediaType: "image/webp",
            revisedPrompt: "A detailed otter",
          },
          {
            id: "image-b",
            mediaType: "image/webp",
            revisedPrompt: null,
          },
        ],
      },
    });
    expect(result).not.toHaveProperty("usage");
    expect(result.response.modelId).toBe("gpt-image-2");
  });

  it("maps source files, URLs, and masks to edit calls", async () => {
    const generate = vi.fn();
    const edit = vi.fn().mockResolvedValue({
      data: [{ base64: "edited", mediaType: "image/png" }],
    });
    const model = createChatGptImageModel({
      images: { generate, edit },
      modelId: "gpt-image-2",
      defaultModel: "gpt-5.5",
    });

    await model.doGenerate(
      callOptions({
        files: [
          {
            type: "file",
            mediaType: "image/png",
            data: "source-base64",
          },
          { type: "url", url: "https://example.com/reference.jpg" },
        ],
        mask: {
          type: "file",
          mediaType: "image/png",
          data: new Uint8Array([1, 2, 3]),
        },
        providerOptions: { chatgpt: { inputFidelity: "high" } },
      }),
    );

    expect(edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "Draw an otter",
        images: [
          { data: "source-base64", mediaType: "image/png" },
          { data: "https://example.com/reference.jpg" },
        ],
        mask: {
          data: new Uint8Array([1, 2, 3]),
          mediaType: "image/png",
        },
        inputFidelity: "high",
      }),
    );
    expect(generate).not.toHaveBeenCalled();
  });

  it("warns for unsupported seed and aspect-ratio-only requests", async () => {
    const model = createChatGptImageModel({
      images: {
        generate: vi.fn().mockResolvedValue({
          data: [{ base64: "image", mediaType: "image/png" }],
        }),
        edit: vi.fn(),
      },
      modelId: "gpt-image-2",
      defaultModel: "gpt-5.5",
    });

    const result = await model.doGenerate(
      callOptions({ seed: 42, aspectRatio: "16:9" }),
    );

    expect(result.warnings).toEqual([
      expect.objectContaining({ type: "unsupported", feature: "seed" }),
      expect.objectContaining({
        type: "unsupported",
        feature: "aspectRatio",
      }),
    ]);
  });

  it("validates provider-specific options", () => {
    expect(() =>
      parseChatGptImageProviderOptions({ compression: 101 }),
    ).toThrow("compression");
    expect(() =>
      parseChatGptImageProviderOptions({ partialImages: 1.5 }),
    ).toThrow("partialImages");
    expect(() => parseChatGptImageProviderOptions({ format: "gif" })).toThrow(
      "format",
    );
  });

  it("propagates ChatGPT image transport errors", async () => {
    const error = new ChatGPTImageError("upstream failed", { status: 502 });
    const model = createChatGptImageModel({
      images: {
        generate: vi.fn().mockRejectedValue(error),
        edit: vi.fn(),
      },
      modelId: "gpt-image-2",
      defaultModel: "gpt-5.5",
    });

    await expect(model.doGenerate(callOptions())).rejects.toBe(error);
  });
});
