import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import {
  BUILTIN_INSTRUCTIONS,
  DEFAULT_INSTRUCTION_KEY,
  isBuiltinInstructionKey,
} from "@redux/types";

import type { DataModel, Doc } from "../_generated/dataModel";
import { mutation, query } from "./index";

type AuthenticatedMutationCtx = GenericMutationCtx<DataModel> & {
  userId: string;
};

type AuthenticatedQueryCtx = GenericQueryCtx<DataModel> & {
  userId: string;
};

function generateInstructionId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
}

function normalizePrompt(prompt: string) {
  const trimmed = prompt.trim();
  if (!trimmed) {
    throw new ConvexError("Instruction prompt cannot be empty");
  }
  return trimmed;
}

function normalizeName(name: string) {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) {
    throw new ConvexError("Instruction name cannot be empty");
  }
  return trimmed;
}

function sortInstructions(instructions: Doc<"instructions">[]) {
  const builtinRank = new Map(
    BUILTIN_INSTRUCTIONS.map((instruction, index) => [instruction.key, index]),
  );

  return [...instructions].sort((a, b) => {
    const aBuiltin = a.builtinKey
      ? (builtinRank.get(a.builtinKey) ?? 999)
      : 999;
    const bBuiltin = b.builtinKey
      ? (builtinRank.get(b.builtinKey) ?? 999)
      : 999;

    if (aBuiltin !== bBuiltin) {
      return aBuiltin - bBuiltin;
    }

    if (a.builtinKey && b.builtinKey) {
      return a.name.localeCompare(b.name);
    }

    if (a.updatedAt !== b.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }

    return a.name.localeCompare(b.name);
  });
}

function toInstructionSummary(instruction: Doc<"instructions">) {
  const prompt = instruction.prompt ?? instruction.defaultPrompt ?? "";
  return {
    instructionId: instruction.instructionId,
    name: instruction.name,
    description: instruction.description,
    prompt,
    defaultPrompt: instruction.defaultPrompt,
    userEdited: instruction.userEdited ?? false,
    builtinKey: instruction.builtinKey,
    isBuiltin: instruction.builtinKey !== undefined,
    isDefault: instruction.builtinKey === DEFAULT_INSTRUCTION_KEY,
    createdAt: instruction.createdAt,
    updatedAt: instruction.updatedAt,
  };
}

async function readUserInstructions(
  ctx: AuthenticatedMutationCtx | AuthenticatedQueryCtx,
  userId: string,
  options?: { includeHidden?: boolean },
) {
  const instructions = await ctx.db
    .query("instructions")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  if (options?.includeHidden) {
    return instructions;
  }

  return instructions.filter((instruction) => instruction.hidden !== true);
}

export async function ensureInstructionsForUser(
  ctx: AuthenticatedMutationCtx,
  userId: string,
) {
  const existing = await readUserInstructions(ctx, userId, {
    includeHidden: true,
  });
  const existingByBuiltinKey = new Map(
    existing.flatMap((instruction) =>
      instruction.builtinKey
        ? [[instruction.builtinKey, instruction] as const]
        : [],
    ),
  );

  const now = Date.now();
  const instructions = existing.filter(
    (instruction) => instruction.hidden !== true,
  );

  for (const builtin of BUILTIN_INSTRUCTIONS) {
    const current = existingByBuiltinKey.get(builtin.key);
    if (!current) {
      const insertedId = await ctx.db.insert("instructions", {
        instructionId: generateInstructionId(),
        userId,
        name: builtin.name,
        description: builtin.description,
        defaultPrompt: builtin.prompt,
        userEdited: false,
        builtinKey: builtin.key,
        createdAt: now,
        updatedAt: now,
      });
      const inserted = await ctx.db.get(insertedId);
      if (inserted && inserted.hidden !== true) {
        instructions.push(inserted);
      }
      continue;
    }

    const patch: Partial<Doc<"instructions">> = {};
    if (current.hidden === true) {
      if (current.name !== builtin.name) {
        patch.name = builtin.name;
      }
      if (current.description !== builtin.description) {
        patch.description = builtin.description;
      }
      if (current.defaultPrompt !== builtin.prompt) {
        patch.defaultPrompt = builtin.prompt;
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await ctx.db.patch(current._id, patch);
        Object.assign(current, patch);
      }
      continue;
    }

    const inheritedPrompt = current.defaultPrompt ?? builtin.prompt;
    const shouldInherit =
      current.userEdited === undefined
        ? current.prompt === undefined || current.prompt === inheritedPrompt
        : current.userEdited === false;

    if (current.name !== builtin.name) {
      patch.name = builtin.name;
    }
    if (current.description !== builtin.description) {
      patch.description = builtin.description;
    }
    if (current.defaultPrompt !== builtin.prompt) {
      patch.defaultPrompt = builtin.prompt;
    }
    if (shouldInherit) {
      if (current.prompt !== undefined) {
        patch.prompt = undefined;
      }
      if (current.userEdited !== false) {
        patch.userEdited = false;
      }
    } else if (current.userEdited !== true) {
      patch.userEdited = true;
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now;
      await ctx.db.patch(current._id, patch);
      Object.assign(current, patch);
    }
  }

  return sortInstructions(instructions);
}

export async function getInstructionForUserById(
  ctx: AuthenticatedMutationCtx | AuthenticatedQueryCtx,
  userId: string,
  instructionId: string,
) {
  const instruction = await ctx.db
    .query("instructions")
    .withIndex("by_instructionId", (q) => q.eq("instructionId", instructionId))
    .first();

  if (instruction?.userId !== userId || instruction.hidden === true) {
    return null;
  }

  return instruction;
}

export async function getDefaultInstructionForUser(
  ctx: AuthenticatedMutationCtx | AuthenticatedQueryCtx,
  userId: string,
) {
  const instruction = await ctx.db
    .query("instructions")
    .withIndex("by_userId_builtinKey", (q) =>
      q.eq("userId", userId).eq("builtinKey", DEFAULT_INSTRUCTION_KEY),
    )
    .first();

  return instruction;
}

export async function normalizeInstructionIdForUser(
  ctx: AuthenticatedMutationCtx,
  userId: string,
  instructionId: string | undefined,
) {
  await ensureInstructionsForUser(ctx, userId);

  if (instructionId) {
    const selectedInstruction = await getInstructionForUserById(
      ctx,
      userId,
      instructionId,
    );
    if (selectedInstruction) {
      return selectedInstruction.instructionId;
    }
  }

  const defaultInstruction = await getDefaultInstructionForUser(ctx, userId);
  if (!defaultInstruction) {
    throw new ConvexError("Default instruction not found");
  }

  return defaultInstruction.instructionId;
}

export const getOrCreateInstructions = mutation({
  args: {},
  handler: async (ctx) => {
    const instructions = await ensureInstructionsForUser(ctx, ctx.userId);
    return instructions.map(toInstructionSummary);
  },
});

export const getInstructions = query({
  args: {},
  handler: async (ctx) => {
    const instructions = sortInstructions(
      await readUserInstructions(ctx, ctx.userId),
    );
    return instructions.map(toInstructionSummary);
  },
});

export const getEffectiveInstruction = query({
  args: {
    instructionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const selected =
      typeof args.instructionId === "string"
        ? await getInstructionForUserById(ctx, ctx.userId, args.instructionId)
        : null;
    const effective =
      selected ?? (await getDefaultInstructionForUser(ctx, ctx.userId));

    if (effective) {
      return toInstructionSummary(effective);
    }

    const fallback = BUILTIN_INSTRUCTIONS.find(
      (instruction) => instruction.key === DEFAULT_INSTRUCTION_KEY,
    );

    return fallback
      ? {
          instructionId: "",
          name: fallback.name,
          description: fallback.description,
          prompt: fallback.prompt,
          defaultPrompt: fallback.prompt,
          builtinKey: fallback.key,
          isBuiltin: true,
          isDefault: true,
          createdAt: 0,
          updatedAt: 0,
        }
      : null;
  },
});

export const createInstruction = mutation({
  args: {
    name: v.string(),
    prompt: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ensureInstructionsForUser(ctx, ctx.userId);

    const now = Date.now();
    const instructionId = generateInstructionId();
    await ctx.db.insert("instructions", {
      instructionId,
      userId: ctx.userId,
      name: normalizeName(args.name),
      description: args.description?.trim() ?? "Custom instruction",
      prompt: normalizePrompt(args.prompt),
      userEdited: true,
      createdAt: now,
      updatedAt: now,
    });

    return { instructionId };
  },
});

export const updateInstruction = mutation({
  args: {
    instructionId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      prompt: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    await ensureInstructionsForUser(ctx, ctx.userId);
    const instruction = await getInstructionForUserById(
      ctx,
      ctx.userId,
      args.instructionId,
    );

    if (!instruction) {
      throw new ConvexError("Instruction not found");
    }

    const update: {
      name?: string;
      prompt?: string;
      userEdited?: boolean;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.patch.name !== undefined) {
      if (instruction.builtinKey) {
        throw new ConvexError("Built-in instruction names cannot be changed");
      }
      update.name = normalizeName(args.patch.name);
    }

    if (args.patch.prompt !== undefined) {
      update.prompt = normalizePrompt(args.patch.prompt);
      update.userEdited = true;
    }

    await ctx.db.patch(instruction._id, update);
    return { success: true as const };
  },
});

export const resetInstruction = mutation({
  args: {
    instructionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ensureInstructionsForUser(ctx, ctx.userId);
    const instruction = await getInstructionForUserById(
      ctx,
      ctx.userId,
      args.instructionId,
    );

    if (!instruction) {
      throw new ConvexError("Instruction not found");
    }

    if (!instruction.builtinKey || !instruction.defaultPrompt) {
      throw new ConvexError("Only built-in instructions can be reset");
    }

    await ctx.db.patch(instruction._id, {
      prompt: undefined,
      userEdited: false,
      updatedAt: Date.now(),
    });

    return { success: true as const };
  },
});

export const deleteInstruction = mutation({
  args: {
    instructionId: v.string(),
  },
  handler: async (ctx, args) => {
    await ensureInstructionsForUser(ctx, ctx.userId);
    const instruction = await ctx.db
      .query("instructions")
      .withIndex("by_instructionId", (q) =>
        q.eq("instructionId", args.instructionId),
      )
      .first();

    if (instruction?.userId !== ctx.userId) {
      throw new ConvexError("Instruction not found");
    }

    if (instruction.hidden === true) {
      throw new ConvexError("Instruction not found");
    }

    if (instruction.builtinKey === DEFAULT_INSTRUCTION_KEY) {
      throw new ConvexError("The default instruction cannot be deleted");
    }

    const defaultInstructionId = await normalizeInstructionIdForUser(
      ctx,
      ctx.userId,
      undefined,
    );

    const userThreads = await ctx.db
      .query("threads")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    for (const thread of userThreads) {
      if (thread.settings.instructionId !== instruction.instructionId) {
        continue;
      }

      await ctx.db.patch(thread._id, {
        settings: {
          ...thread.settings,
          instructionId: defaultInstructionId,
        },
        updatedAt: Date.now(),
      });
    }

    const defaultSettings = await ctx.db
      .query("defaultMessageSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (defaultSettings?.settings.instructionId === instruction.instructionId) {
      await ctx.db.patch(defaultSettings._id, {
        settings: {
          ...defaultSettings.settings,
          instructionId: defaultInstructionId,
        },
        updatedAt: Date.now(),
      });
    }

    if (instruction.builtinKey) {
      await ctx.db.patch(instruction._id, {
        hidden: true,
        updatedAt: Date.now(),
      });
      return { success: true as const };
    }

    await ctx.db.delete(instruction._id);
    return { success: true as const };
  },
});

export const getBuiltinInstructionMeta = query({
  args: {
    builtinKey: v.string(),
  },
  handler: (_ctx, args) => {
    if (!isBuiltinInstructionKey(args.builtinKey)) {
      throw new ConvexError("Unknown built-in instruction");
    }

    const instruction = BUILTIN_INSTRUCTIONS.find(
      (candidate) => candidate.key === args.builtinKey,
    );

    if (!instruction) {
      throw new ConvexError("Unknown built-in instruction");
    }

    return instruction;
  },
});

export const migrateBuiltinInstructionPromptInheritance = mutation({
  args: {},
  handler: async (ctx) => {
    const instructions = await ctx.db
      .query("instructions")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    let migrated = 0;

    for (const instruction of instructions) {
      if (!instruction.builtinKey) {
        if (instruction.userEdited === undefined) {
          await ctx.db.patch(instruction._id, {
            userEdited: true,
            updatedAt: Date.now(),
          });
          migrated += 1;
        }
        continue;
      }

      const inheritedPrompt =
        typeof instruction.defaultPrompt === "string"
          ? instruction.defaultPrompt
          : BUILTIN_INSTRUCTIONS.find(
              (candidate) => candidate.key === instruction.builtinKey,
            )?.prompt;

      const shouldInherit =
        instruction.prompt === undefined ||
        (typeof inheritedPrompt === "string" &&
          instruction.prompt === inheritedPrompt);

      await ctx.db.patch(instruction._id, {
        prompt: shouldInherit ? undefined : instruction.prompt,
        userEdited: !shouldInherit,
        defaultPrompt: inheritedPrompt,
        updatedAt: Date.now(),
      });
      migrated += 1;
    }

    return { migrated };
  },
});
