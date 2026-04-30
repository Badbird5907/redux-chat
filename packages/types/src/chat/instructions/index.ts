import { DEFAULT_INSTRUCTION } from "./default";
import { LEARNING_INSTRUCTION } from "./learning";

export const BUILTIN_INSTRUCTION_KEYS = ["default", "learning"] as const;

export type BuiltinInstructionKey = (typeof BUILTIN_INSTRUCTION_KEYS)[number];

export interface BuiltinInstructionDefinition {
  key: BuiltinInstructionKey;
  name: string;
  description: string;
  prompt: string;
}

export const BUILTIN_INSTRUCTIONS: readonly BuiltinInstructionDefinition[] = [
  DEFAULT_INSTRUCTION,
  LEARNING_INSTRUCTION,
] as const;

export const DEFAULT_INSTRUCTION_KEY: BuiltinInstructionKey = "default";

export function isBuiltinInstructionKey(
  value: string,
): value is BuiltinInstructionKey {
  return BUILTIN_INSTRUCTION_KEYS.includes(value as BuiltinInstructionKey);
}
