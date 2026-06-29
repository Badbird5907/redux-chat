import type { Infer } from "convex/values";
import { v } from "convex/values";

import type { chatScrollPreferences } from "../schema";
import { chatScrollOpenPosition } from "../schema";
import { mutation, query } from "./index";

type ChatScrollPreferences = Infer<typeof chatScrollPreferences>;

const DEFAULT_CHAT_SCROLL_PREFERENCES: ChatScrollPreferences = {
  autoScroll: true,
  openPosition: "last-anchor",
  keepPreviousVisible: true,
};

const chatScrollPreferencesPatch = v.object({
  autoScroll: v.optional(v.boolean()),
  openPosition: v.optional(chatScrollOpenPosition),
  keepPreviousVisible: v.optional(v.boolean()),
});

export const get = query({
  args: {},
  handler: async (ctx): Promise<ChatScrollPreferences | null> => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    return settings?.chatScroll ?? null;
  },
});

export const update = mutation({
  args: { patch: chatScrollPreferencesPatch },
  handler: async (ctx, args): Promise<ChatScrollPreferences> => {
    const now = Date.now();
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    const merged: ChatScrollPreferences = {
      ...DEFAULT_CHAT_SCROLL_PREFERENCES,
      ...existing?.chatScroll,
      ...args.patch,
    };

    if (existing) {
      await ctx.db.patch(existing._id, { chatScroll: merged, updatedAt: now });
    } else {
      await ctx.db.insert("userSettings", {
        userId: ctx.userId,
        chatScroll: merged,
        updatedAt: now,
      });
    }

    return merged;
  },
});

export const reset = mutation({
  args: {},
  handler: async (ctx): Promise<null> => {
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();

    if (existing?.chatScroll !== undefined) {
      await ctx.db.patch(existing._id, {
        chatScroll: undefined,
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});
