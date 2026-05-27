import { v } from "convex/values";

import { mergeMessageSettings, normalizeMessageSettings } from "@redux/types";

import { mutation } from "./index";
import { normalizeInstructionIdForUser } from "./instructions";

const thinkingLevelValidator = v.union(
  v.literal("instant"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);

export const getOrCreate = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("defaultMessageSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existing) {
      const normalizedSettings = normalizeMessageSettings(existing.settings);
      normalizedSettings.instructionId = await normalizeInstructionIdForUser(
        ctx,
        ctx.userId,
        normalizedSettings.instructionId,
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
    settings.instructionId = await normalizeInstructionIdForUser(
      ctx,
      ctx.userId,
      settings.instructionId,
    );
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
      instructionId: v.optional(v.string()),
      clearInstructionId: v.optional(v.boolean()),
      model: v.optional(v.string()),
      thinkingLevel: v.optional(thinkingLevelValidator),
      tools: v.optional(
        v.object({
          search: v.optional(v.object({})),
          bashWorkspace: v.optional(v.object({})),
          analysisWorkspace: v.optional(
            v.object({
              syncUploads: v.optional(v.boolean()),
            }),
          ),
          mcpServers: v.optional(
            v.object({
              serverIds: v.array(v.string()),
            }),
          ),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("defaultMessageSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    const { clearInstructionId, ...settingsPatch } = args.patch;
    const mergedSettings = mergeMessageSettings(
      existing?.settings,
      settingsPatch,
    );
    mergedSettings.instructionId = await normalizeInstructionIdForUser(
      ctx,
      ctx.userId,
      clearInstructionId ? undefined : mergedSettings.instructionId,
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
