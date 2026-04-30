"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";

import { api } from "@redux/backend/convex/_generated/api";
import { DEFAULT_INSTRUCTION_KEY } from "@redux/types";

import { authClient } from "@/lib/auth/client";
import { useQuery } from "./convex";

interface InstructionSummary {
  instructionId: string;
  name: string;
  description: string;
  prompt: string;
  defaultPrompt?: string;
  userEdited: boolean;
  builtinKey?: string;
  isBuiltin: boolean;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

export function useInstructions() {
  const { data: session } = authClient.useSession();
  const ensureInstructions = useMutation(
    api.functions.instructions.getOrCreateInstructions,
  );
  const instructionsQuery = useQuery(api.functions.instructions.getInstructions, {});
  const [seededInstructions, setSeededInstructions] = useState<
    InstructionSummary[]
  >([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!session?.session.userId) {
        if (!cancelled) {
          setSeededInstructions([]);
          setIsReady(true);
        }
        return;
      }

      setIsReady(false);
      try {
        const ensured = await ensureInstructions({});
        if (!cancelled) {
          setSeededInstructions(ensured);
          setIsReady(true);
        }
      } catch (error) {
        console.error("Failed to load instructions", error);
        if (!cancelled) {
          setIsReady(true);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [ensureInstructions, session?.session.userId]);

  const instructions = instructionsQuery ?? seededInstructions;

  const defaultInstruction = useMemo(
    () =>
      instructions.find(
        (instruction) => instruction.builtinKey === DEFAULT_INSTRUCTION_KEY,
      ),
    [instructions],
  );

  const instructionsById = useMemo(
    () =>
      new Map(
        instructions.map((instruction) => [instruction.instructionId, instruction]),
      ),
    [instructions],
  );

  return {
    instructions,
    instructionsById,
    defaultInstruction,
    isReady,
  };
}
