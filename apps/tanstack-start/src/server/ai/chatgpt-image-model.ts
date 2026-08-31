import type {
  ImageModelV4,
  ImageModelV4File,
  SharedV4Warning,
} from "@ai-sdk/provider";

import type {
  ChatGptImageInput,
  ChatGptImagesClient,
} from "./chatgpt-images-client";

export interface ChatGptImageProviderOptions {
  quality?: "auto" | "low" | "medium" | "high";
  format?: "png" | "jpeg" | "webp";
  compression?: number;
  background?: "auto" | "opaque" | "transparent";
  inputFidelity?: "low" | "high";
  partialImages?: number;
}

export function createChatGptImageModel(args: {
  images: ChatGptImagesClient;
  modelId: string;
  defaultModel: string;
}): ImageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "chatgpt",
    modelId: args.modelId,
    maxImagesPerCall: 10,
    doGenerate: async (options) => {
      const timestamp = new Date();
      const warnings: SharedV4Warning[] = [];
      if (options.seed !== undefined) {
        warnings.push({
          type: "unsupported",
          feature: "seed",
          details:
            "ChatGPT image generation does not expose deterministic seeds.",
        });
      }
      if (options.aspectRatio && !options.size) {
        warnings.push({
          type: "unsupported",
          feature: "aspectRatio",
          details: "Pass an explicit image size instead of an aspect ratio.",
        });
      }
      const providerOptions = parseChatGptImageProviderOptions(
        options.providerOptions.chatgpt,
      );
      const { inputFidelity, ...generationOptions } = providerOptions;
      const common = {
        prompt: options.prompt ?? "",
        model: args.defaultModel,
        imageModel: args.modelId,
        n: options.n,
        size: options.size,
        signal: options.abortSignal,
        ...generationOptions,
      };
      const result = options.files?.length
        ? await args.images.edit({
            ...common,
            images: options.files.map(toChatGptImageInput),
            ...(options.mask
              ? { mask: toChatGptImageInput(options.mask) }
              : {}),
            ...(inputFidelity ? { inputFidelity } : {}),
          })
        : await args.images.generate(common);

      return {
        images: result.data.map((image) => image.base64),
        warnings,
        providerMetadata: {
          chatgpt: {
            images: result.data.map((image) => ({
              id: image.id ?? null,
              mediaType: image.mediaType,
              revisedPrompt: image.revisedPrompt ?? null,
            })),
          },
        },
        response: {
          timestamp,
          modelId: args.modelId,
          headers: undefined,
        },
      };
    },
  };
}

function toChatGptImageInput(file: ImageModelV4File): ChatGptImageInput {
  if (file.type === "url") {
    return { data: file.url };
  }
  if (!file.mediaType.startsWith("image/")) {
    throw new TypeError("ChatGPT image inputs must use an image media type.");
  }
  return {
    data: file.data,
    mediaType: file.mediaType as `image/${string}`,
  };
}

export function parseChatGptImageProviderOptions(
  value: unknown,
): ChatGptImageProviderOptions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const result: ChatGptImageProviderOptions = {};
  if (record.quality !== undefined) {
    assertEnumOption(record.quality, "quality", [
      "auto",
      "low",
      "medium",
      "high",
    ]);
    result.quality = record.quality;
  }
  if (record.format !== undefined) {
    assertEnumOption(record.format, "format", ["png", "jpeg", "webp"]);
    result.format = record.format;
  }
  if (record.compression !== undefined) {
    assertIntegerOption(record.compression, "compression", 0, 100);
    result.compression = record.compression;
  }
  if (record.background !== undefined) {
    assertEnumOption(record.background, "background", [
      "auto",
      "opaque",
      "transparent",
    ]);
    result.background = record.background;
  }
  if (record.inputFidelity !== undefined) {
    assertEnumOption(record.inputFidelity, "inputFidelity", ["low", "high"]);
    result.inputFidelity = record.inputFidelity;
  }
  if (record.partialImages !== undefined) {
    assertIntegerOption(record.partialImages, "partialImages", 0, 3);
    result.partialImages = record.partialImages;
  }
  return result;
}

function assertEnumOption<const T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): asserts value is T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new TypeError(
      `Invalid ChatGPT image option ${name}; expected ${allowed.join(", ")}.`,
    );
  }
}

function assertIntegerOption(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): asserts value is number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(
      `Invalid ChatGPT image option ${name}; expected an integer from ${minimum} to ${maximum}.`,
    );
  }
}
