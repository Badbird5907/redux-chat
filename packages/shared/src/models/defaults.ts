import type { CanonicalModelId } from "./types";

export const DEFAULT_CHAT_MODEL_ID: CanonicalModelId = "moonshot/kimi-k2.5";

export const defaultFavorites = [
  "moonshot/kimi-k2.5",
  "openai/gpt-5-mini",
  "anthropic/claude-sonnet-4-20250514",
  "google/gemini-2.5-pro",
] as const satisfies readonly CanonicalModelId[];
