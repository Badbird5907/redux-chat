import type { CanonicalModelId } from "./types";

export const DEFAULT_CHAT_MODEL_ID: CanonicalModelId = "moonshot/kimi-k2.5";
export const DEFAULT_IMAGE_GENERATION_MODEL_ID: CanonicalModelId =
  "google/nano-banana-2";

export const defaultFavorites = [
  "moonshot/kimi-k2.5",
  "openai/gpt-5.5-mini",
  "anthropic/claude-sonnet-5",
  "google/gemini-3.1-pro-preview",
] as const satisfies readonly CanonicalModelId[];
