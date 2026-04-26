import { v } from "convex/values";

import { mergeMessageSettings, normalizeMessageSettings } from "@redux/types";

import { mutation } from "./index";

export const getOrCreate = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("defaultMessageSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existing) {
      const normalizedSettings = normalizeMessageSettings(existing.settings);
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
      tools: v.optional(
        v.object({
          search: v.optional(v.object({})),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("defaultMessageSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    const mergedSettings = mergeMessageSettings(existing?.settings, args.patch);

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
