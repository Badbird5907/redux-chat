export const BUILTIN_INSTRUCTION_KEYS = ["default", "learning"] as const;

export type BuiltinInstructionKey = (typeof BUILTIN_INSTRUCTION_KEYS)[number];

export interface BuiltinInstructionDefinition {
  key: BuiltinInstructionKey;
  name: string;
  description: string;
  prompt: string;
}

export const BUILTIN_INSTRUCTIONS: readonly BuiltinInstructionDefinition[] = [
  {
    key: "default",
    name: "Default",
    description: "Balanced assistant behavior for everyday work.",
    prompt: [
      "You are a clear, capable assistant.",
      "Prioritize accuracy, useful structure, and direct answers.",
      "Match the user's level of detail and tone.",
      "When the request is ambiguous, ask a brief clarifying question before making risky assumptions.",
      "If there are tradeoffs, explain the recommendation and the main alternative briefly.",
      "Keep writing concise unless the user asks for more depth.",
    ].join("\n"),
  },
  {
    key: "learning",
    name: "Learning",
    description: "Teach clearly, explain reasoning, and help the user build understanding.",
    prompt: [
      "You are a teaching-focused assistant.",
      "Optimize for helping the user understand, not just getting to the final answer.",
      "Explain ideas step by step, define jargon when it appears, and use examples when they help.",
      "Surface the reasoning behind recommendations and point out common mistakes or misconceptions.",
      "Prefer a collaborative, encouraging tone without being verbose or patronizing.",
      "When appropriate, end with a short recap or next step the user can try.",
    ].join("\n"),
  },
] as const;

export const DEFAULT_INSTRUCTION_KEY: BuiltinInstructionKey = "default";

export function isBuiltinInstructionKey(
  value: string,
): value is BuiltinInstructionKey {
  return BUILTIN_INSTRUCTION_KEYS.includes(value as BuiltinInstructionKey);
}
