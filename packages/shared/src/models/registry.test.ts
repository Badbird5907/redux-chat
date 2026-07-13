import { describe, expect, it } from "vitest";

import {
  getChatModelConfig,
  getImageGenerationToolModels,
  isImageOutputModel,
} from "./registry";

describe("chat model registry", () => {
  it("includes GPT-5.6 Sol, Terra, and Luna with OpenAI defaults", () => {
    for (const modelId of [
      "openai/gpt-5.6-sol",
      "openai/gpt-5.6-terra",
      "openai/gpt-5.6-luna",
    ] as const) {
      const model = getChatModelConfig(modelId);

      expect(model, modelId).toBeDefined();
      expect(model?.defaultProviderId).toBe(modelId.replace("/", ":"));
      expect(model?.providerIds).toEqual([
        `openrouter:${modelId}`,
        modelId.replace("/", ":"),
      ]);
      expect(model?.supports.reasoning).toBe(true);
    }
  });
});

describe("image model registry", () => {
  it("includes curated image models with image output capability", () => {
    for (const modelId of [
      "google/nano-banana-2",
      "openai/gpt-image-2",
      "google/nano-banana-pro",
    ]) {
      expect(getChatModelConfig(modelId), modelId).toBeDefined();
      expect(isImageOutputModel(modelId), modelId).toBe(true);
    }
  });

  it("exposes image generation tool eligible models", () => {
    const modelIds = getImageGenerationToolModels().map((model) => model.id);

    expect(modelIds).toEqual(
      expect.arrayContaining([
        "google/nano-banana-2",
        "openai/gpt-image-2",
        "google/nano-banana-pro",
      ]),
    );
  });
});
