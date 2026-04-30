import type { CanonicalModelId } from "./types";

export const DEFAULT_CHAT_MODEL_ID: CanonicalModelId = "openai/gpt-5-mini";

export const defaultFavorites = [
  "openai/gpt-5-mini",
  "anthropic/claude-sonnet-4-20250514",
  "google/gemini-2.5-pro",
] as const satisfies readonly CanonicalModelId[];
