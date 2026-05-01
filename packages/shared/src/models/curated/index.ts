import { ANTHROPIC_PROVIDER } from "./anthropic";
import { DEEPSEEK_PROVIDER } from "./deepseek";
import { GOOGLE_PROVIDER } from "./google";
import { MOONSHOT_PROVIDER } from "./moonshot";
import { OPENAI_PROVIDER } from "./openai";
import { XAI_PROVIDER } from "./xai";

export const PROVIDERS = [
  OPENAI_PROVIDER,
  ANTHROPIC_PROVIDER,
  GOOGLE_PROVIDER,
  MOONSHOT_PROVIDER,
  DEEPSEEK_PROVIDER,
  XAI_PROVIDER,
] as const;
