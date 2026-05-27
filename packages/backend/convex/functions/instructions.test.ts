import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const NOW = 1_700_000_000_000;

function authedTest() {
  return convexTest(schema, modules).withIdentity({ subject: USER_ID });
}

describe("functions/instructions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects deleting built-in instructions", async () => {
    const t = authedTest();
    const instructions = await t.mutation(
      api.functions.instructions.getOrCreateInstructions,
      {},
    );
    const learningInstruction = instructions.find(
      (instruction) => instruction.builtinKey === "learning",
    );

    expect(learningInstruction).toBeDefined();

    await expect(
      t.mutation(api.functions.instructions.deleteInstruction, {
        instructionId: learningInstruction?.instructionId ?? "",
      }),
    ).rejects.toThrow("Built-in instructions cannot be deleted");

    await expect(
      t.query(api.functions.instructions.getInstructions, {}),
    ).resolves.toContainEqual(
      expect.objectContaining({
        builtinKey: "learning",
        isBuiltin: true,
      }),
    );
  });

  it("restores built-in instructions hidden by old deletion behavior", async () => {
    const t = authedTest();
    const instructions = await t.mutation(
      api.functions.instructions.getOrCreateInstructions,
      {},
    );
    const learningInstruction = instructions.find(
      (instruction) => instruction.builtinKey === "learning",
    );

    if (!learningInstruction) {
      throw new Error("Expected learning instruction to be created");
    }

    await t.run(async (ctx) => {
      const stored = await ctx.db
        .query("instructions")
        .withIndex("by_instructionId", (q) =>
          q.eq("instructionId", learningInstruction.instructionId),
        )
        .first();

      if (!stored) {
        throw new Error("Expected learning instruction to be stored");
      }

      await ctx.db.patch(stored._id, {
        hidden: true,
        updatedAt: NOW,
      });
    });

    await expect(
      t.mutation(api.functions.instructions.getOrCreateInstructions, {}),
    ).resolves.toContainEqual(
      expect.objectContaining({
        instructionId: learningInstruction.instructionId,
        builtinKey: "learning",
        isBuiltin: true,
      }),
    );
  });

  it("deletes custom instructions", async () => {
    const t = authedTest();
    const { instructionId } = await t.mutation(
      api.functions.instructions.createInstruction,
      {
        name: "Custom",
        prompt: "Use terse answers.",
      },
    );

    await expect(
      t.mutation(api.functions.instructions.deleteInstruction, {
        instructionId,
      }),
    ).resolves.toEqual({ success: true });

    await expect(
      t.query(api.functions.instructions.getInstructions, {}),
    ).resolves.not.toContainEqual(expect.objectContaining({ instructionId }));
  });
});
