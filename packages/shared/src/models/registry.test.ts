import { describe, expect, it } from "vitest";

import {
  getChatModelConfig,
  getImageGenerationToolModels,
  isImageOutputModel,
} from "./registry";

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
