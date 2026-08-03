import { v } from "convex/values";

import {
  mergePersistedMessageSettings,
  normalizeMessageSettings,
  normalizePersistedMessageSettings,
} from "@redux/types";

import { mutation } from "./index";

const thinkingLevelValidator = v.union(
  v.literal("instant"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);
const emptyToolPatchValidator = v.union(
  v.object({}),
  v.literal(false),
  v.null(),
);
const toolPatchValidator = v.object({
  search: v.optional(emptyToolPatchValidator),
  bashWorkspace: v.optional(emptyToolPatchValidator),
  analysisWorkspace: v.optional(
    v.union(
      v.object({
        syncUploads: v.optional(v.boolean()),
      }),
      v.literal(false),
      v.null(),
    ),
  ),
  mcpServers: v.optional(
    v.union(
      v.object({
        serverIds: v.optional(v.union(v.array(v.string()), v.null())),
      }),
      v.literal(false),
      v.null(),
    ),
  ),
  imageGeneration: v.optional(
    v.union(
      v.object({
        modelId: v.optional(v.union(v.string(), v.null())),
      }),
      v.literal(false),
      v.null(),
    ),
  ),
});

export const getOrCreate = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("defaultMessageSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existing) {
      const normalizedSettings = normalizePersistedMessageSettings(
        existing.settings,
      );
      if (
        JSON.stringify(normalizedSettings) !== JSON.stringify(existing.settings)
      ) {
        await ctx.db.patch(existing._id, {
          settings: normalizedSettings,
          updatedAt: Date.now(),
        });
      }
      return normalizedSettings;
    }

    const settings = normalizeMessageSettings(undefined);
    await ctx.db.insert("defaultMessageSettings", {
      userId: ctx.userId,
      settings,
      updatedAt: Date.now(),
    });
    return settings;
  },
});

export const update = mutation({
  args: {
    patch: v.object({
      model: v.optional(v.string()),
      thinkingLevel: v.optional(thinkingLevelValidator),
      tools: v.optional(v.union(toolPatchValidator, v.null())),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("defaultMessageSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    const mergedSettings = mergePersistedMessageSettings(
      existing?.settings,
      args.patch,
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        settings: mergedSettings,
        updatedAt: Date.now(),
      });
      return mergedSettings;
    }

    await ctx.db.insert("defaultMessageSettings", {
      userId: ctx.userId,
      settings: mergedSettings,
      updatedAt: Date.now(),
    });

    return mergedSettings;
  },
});
