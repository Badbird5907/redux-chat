import { ANTHROPIC_PROVIDER } from "./anthropic";
import { GOOGLE_PROVIDER } from "./google";
import { OPENAI_PROVIDER } from "./openai";

export const PROVIDERS = [
  OPENAI_PROVIDER,
  ANTHROPIC_PROVIDER,
  GOOGLE_PROVIDER,
] as const;
