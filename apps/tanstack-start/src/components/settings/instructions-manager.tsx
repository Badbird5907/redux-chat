"use client";

import { useMemo } from "react";
import { useMutation } from "convex/react";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent, CardHeader } from "@redux/ui/components/card";
import { Input } from "@redux/ui/components/input";
import { Textarea } from "@redux/ui/components/textarea";

import { useInstructions } from "@/lib/hooks/use-instructions";
import { useReducerState } from "@/lib/hooks/use-reducer-state";

interface InstructionDraft {
  name: string;
  prompt: string;
}

function createInstructionDraft(instruction: {
  name: string;
  prompt: string;
}): InstructionDraft {
  return {
    name: instruction.name,
    prompt: instruction.prompt,
  };
}

export function InstructionsManager() {
  const { instructions, isReady } = useInstructions();
  const createInstruction = useMutation(
    api.functions.instructions.createInstruction,
  );
  const updateInstruction = useMutation(
    api.functions.instructions.updateInstruction,
  );
  const resetInstruction = useMutation(
    api.functions.instructions.resetInstruction,
  );
  const deleteInstruction = useMutation(
    api.functions.instructions.deleteInstruction,
  );

  const [drafts, setDrafts] = useReducerState<Record<string, InstructionDraft>>(
    {},
  );
  const [newInstructionName, setNewInstructionName] = useReducerState("");
  const [newInstructionPrompt, setNewInstructionPrompt] = useReducerState("");
  const [creating, setCreating] = useReducerState(false);
  const [savingInstructionId, setSavingInstructionId] = useReducerState<
    string | null
  >(null);
  const [resettingInstructionId, setResettingInstructionId] = useReducerState<
    string | null
  >(null);
  const [deletingInstructionId, setDeletingInstructionId] = useReducerState<
    string | null
  >(null);

  const mergedDrafts = useMemo(
    () =>
      Object.fromEntries(
        instructions.map((instruction) => [
          instruction.instructionId,
          drafts[instruction.instructionId] ??
            createInstructionDraft(instruction),
        ]),
      ),
    [drafts, instructions],
  );

  const dirtyInstructionIds = useMemo(
    () =>
      new Set(
        instructions.flatMap((instruction) => {
          const draft = mergedDrafts[instruction.instructionId];
          if (!draft) {
            return [];
          }

          return draft.name !== instruction.name ||
            draft.prompt !== instruction.prompt
            ? [instruction.instructionId]
            : [];
        }),
      ),
    [instructions, mergedDrafts],
  );

  const handleSave = async (instructionId: string) => {
    const draft = mergedDrafts[instructionId];
    const instruction = instructions.find(
      (candidate) => candidate.instructionId === instructionId,
    );

    if (!draft || !instruction) {
      return;
    }

    setSavingInstructionId(instructionId);
    try {
      await updateInstruction({
        instructionId,
        patch: {
          name: instruction.isBuiltin ? undefined : draft.name,
          prompt: draft.prompt,
        },
      });
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [instructionId]: {
          name: instruction.isBuiltin ? instruction.name : draft.name.trim(),
          prompt: draft.prompt.trim(),
        },
      }));
      toast.success("Instruction saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save instruction",
      );
    } finally {
      setSavingInstructionId(null);
    }
  };

  const handleReset = async (instructionId: string) => {
    const instruction = instructions.find(
      (candidate) => candidate.instructionId === instructionId,
    );
    setResettingInstructionId(instructionId);
    try {
      await resetInstruction({ instructionId });
      setDrafts((currentDrafts) => ({
        ...currentDrafts,
        [instructionId]: {
          name: instruction?.name ?? currentDrafts[instructionId]?.name ?? "",
          prompt:
            instruction?.defaultPrompt ??
            currentDrafts[instructionId]?.prompt ??
            "",
        },
      }));
      toast.success("Instruction reset");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reset instruction",
      );
    } finally {
      setResettingInstructionId(null);
    }
  };

  const handleDelete = async (instructionId: string) => {
    const instruction = instructions.find(
      (candidate) => candidate.instructionId === instructionId,
    );
    if (!instruction) {
      return;
    }

    if (!window.confirm(`Delete "${instruction.name}"?`)) {
      return;
    }

    setDeletingInstructionId(instructionId);
    try {
      await deleteInstruction({ instructionId });
      setDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[instructionId];
        return nextDrafts;
      });
      toast.success("Instruction deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete instruction",
      );
    } finally {
      setDeletingInstructionId(null);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createInstruction({
        name: newInstructionName,
        prompt: newInstructionPrompt,
      });
      setNewInstructionName("");
      setNewInstructionPrompt("");
      toast.success("Instruction created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create instruction",
      );
    } finally {
      setCreating(false);
    }
  };

  if (!isReady && instructions.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">Loading instructions…</div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight">
          Instructions
        </h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Tailor the model's behavior with custom instructions.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-1">
          <div className="text-sm font-medium">New instruction</div>
          <div className="text-muted-foreground text-sm">
            Create a reusable instruction for a specific workflow or writing
            style.
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Input
            value={newInstructionName}
            placeholder="Instruction name"
            onChange={(event) => setNewInstructionName(event.target.value)}
          />
          <Textarea
            rows={6}
            className="field-sizing-fixed resize-y overflow-y-auto"
            value={newInstructionPrompt}
            placeholder="Tell the model how it should behave, write, and respond..."
            onChange={(event) => setNewInstructionPrompt(event.target.value)}
          />
          <div className="flex justify-end">
            <Button
              disabled={
                creating ||
                newInstructionName.trim().length === 0 ||
                newInstructionPrompt.trim().length === 0
              }
              onClick={() => void handleCreate()}
            >
              {creating ? "Creating..." : "Create instruction"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {instructions.map((instruction) => {
          const draft =
            mergedDrafts[instruction.instructionId] ??
            createInstructionDraft(instruction);
          const isDirty = dirtyInstructionIds.has(instruction.instructionId);
          const isSaving = savingInstructionId === instruction.instructionId;
          const isResetting =
            resettingInstructionId === instruction.instructionId;
          const isDeleting =
            deletingInstructionId === instruction.instructionId;

          return (
            <Card key={instruction.instructionId}>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-medium">
                      {instruction.name}
                    </div>
                    {instruction.isDefault ? <Badge>Default</Badge> : null}
                    {instruction.isBuiltin ? (
                      <Badge variant="secondary">Built-in</Badge>
                    ) : (
                      <Badge variant="secondary">Custom</Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-sm">
                    {instruction.description}
                  </div>
                  {instruction.isBuiltin && !instruction.userEdited ? (
                    <div className="text-muted-foreground text-xs">
                      Inheriting the current builtin prompt.
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  {instruction.isBuiltin ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isResetting}
                      onClick={() =>
                        void handleReset(instruction.instructionId)
                      }
                    >
                      <RotateCcw className="size-4" />
                      {isResetting ? "Resetting..." : "Reset"}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isDeleting}
                      onClick={() =>
                        void handleDelete(instruction.instructionId)
                      }
                    >
                      <Trash2 className="size-4" />
                      {isDeleting ? "Deleting..." : "Delete"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <Input
                  value={draft.name}
                  disabled={instruction.isBuiltin}
                  onChange={(event) =>
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [instruction.instructionId]: {
                        ...(currentDrafts[instruction.instructionId] ?? draft),
                        name: event.target.value,
                      },
                    }))
                  }
                />
                <Textarea
                  rows={8}
                  className="field-sizing-fixed resize-y overflow-y-auto"
                  value={draft.prompt}
                  onChange={(event) =>
                    setDrafts((currentDrafts) => ({
                      ...currentDrafts,
                      [instruction.instructionId]: {
                        ...(currentDrafts[instruction.instructionId] ?? draft),
                        prompt: event.target.value,
                      },
                    }))
                  }
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!isDirty || isSaving || isResetting || isDeleting}
                    onClick={() => void handleSave(instruction.instructionId)}
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
