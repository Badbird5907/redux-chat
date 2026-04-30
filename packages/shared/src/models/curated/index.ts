import { ANTHROPIC_PROVIDER } from "./anthropic";
import { GOOGLE_PROVIDER } from "./google";
import { MOONSHOT_PROVIDER } from "./moonshot";
import { OPENAI_PROVIDER } from "./openai";

export const PROVIDERS = [
  OPENAI_PROVIDER,
  ANTHROPIC_PROVIDER,
  GOOGLE_PROVIDER,
  MOONSHOT_PROVIDER
] as const;
