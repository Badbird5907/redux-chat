import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import { defaultFavorites } from "@redux/shared/models";

import type { DataModel } from "../_generated/dataModel";
import { mutation, query } from "./index";

const MAX_FAVORITE_MODELS = 50;
const defaultFavoriteIds = new Set<string>(defaultFavorites);

type AuthenticatedCtx = (
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
) & {
  userId: string;
};
type AuthenticatedMutationCtx = GenericMutationCtx<DataModel> & {
  userId: string;
};

async function getFavoriteState(ctx: AuthenticatedCtx) {
  return ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .first();
}

async function listFavoriteDocs(ctx: AuthenticatedCtx) {
  return ctx.db
    .query("modelFavorites")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .order("asc")
    .collect();
}

async function markFavoritesInitialized(ctx: AuthenticatedMutationCtx) {
  const now = Date.now();
  const existingState = await getFavoriteState(ctx);

  if (existingState) {
    await ctx.db.patch(existingState._id, {
      modelFavoritesInitializedAt:
        existingState.modelFavoritesInitializedAt ?? now,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("userSettings", {
    userId: ctx.userId,
    modelFavoritesInitializedAt: now,
    updatedAt: now,
  });
}

async function insertDefaultFavorites(
  ctx: AuthenticatedMutationCtx,
  options: { excludeModelId?: string } = {},
) {
  const now = Date.now();

  for (const [index, modelId] of defaultFavorites
    .filter((defaultModelId) => defaultModelId !== options.excludeModelId)
    .entries()) {
    await ctx.db.insert("modelFavorites", {
      userId: ctx.userId,
      modelId,
      sortOrder: index,
      fromDefault: true,
      createdAt: now,
      updatedAt: now,
    });
  }
}

function uniqueModelIds(modelIds: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const modelId of modelIds) {
    const trimmed = modelId.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result.slice(0, MAX_FAVORITE_MODELS);
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const favorites = await listFavoriteDocs(ctx);
    if (favorites.length > 0) {
      return favorites.map((favorite) => favorite.modelId);
    }

    const favoriteState = await getFavoriteState(ctx);
    return favoriteState?.modelFavoritesInitializedAt
      ? []
      : [...defaultFavorites];
  },
});

export const getOrCreateDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    const favoriteState = await getFavoriteState(ctx);
    const favorites = await listFavoriteDocs(ctx);
    if (favorites.length > 0) {
      if (!favoriteState) {
        await markFavoritesInitialized(ctx);
      }
      return favorites.map((favorite) => favorite.modelId);
    }

    if (favoriteState?.modelFavoritesInitializedAt) {
      return [];
    }

    await insertDefaultFavorites(ctx);
    await markFavoritesInitialized(ctx);
    return [...defaultFavorites];
  },
});

export const setFavorite = mutation({
  args: {
    modelId: v.string(),
    favorited: v.boolean(),
  },
  handler: async (ctx, { modelId, favorited }) => {
    const trimmedModelId = modelId.trim();
    if (!trimmedModelId) {
      throw new ConvexError("Model ID is required");
    }

    const existing = await ctx.db
      .query("modelFavorites")
      .withIndex("by_userId_modelId", (q) =>
        q.eq("userId", ctx.userId).eq("modelId", trimmedModelId),
      )
      .first();

    if (!favorited) {
      if (existing) {
        await markFavoritesInitialized(ctx);
        await ctx.db.delete(existing._id);
      } else {
        const favoriteState = await getFavoriteState(ctx);
        const favorites = await listFavoriteDocs(ctx);
        if (
          !favoriteState?.modelFavoritesInitializedAt &&
          favorites.length === 0 &&
          defaultFavoriteIds.has(trimmedModelId)
        ) {
          await insertDefaultFavorites(ctx, { excludeModelId: trimmedModelId });
          await markFavoritesInitialized(ctx);
        }
      }
      return;
    }

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: now });
      return;
    }

    const favorites = await listFavoriteDocs(ctx);
    if (favorites.length >= MAX_FAVORITE_MODELS) {
      throw new ConvexError("Too many favorite models");
    }

    const sortOrder =
      favorites.reduce(
        (max, favorite) => Math.max(max, favorite.sortOrder),
        -1,
      ) + 1;

    await markFavoritesInitialized(ctx);
    await ctx.db.insert("modelFavorites", {
      userId: ctx.userId,
      modelId: trimmedModelId,
      sortOrder,
      fromDefault: false,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const reorder = mutation({
  args: {
    modelIds: v.array(v.string()),
  },
  handler: async (ctx, { modelIds }) => {
    const orderedModelIds = uniqueModelIds(modelIds);
    const favorites = await listFavoriteDocs(ctx);
    const favoriteByModelId = new Map(
      favorites.map((favorite) => [favorite.modelId, favorite] as const),
    );

    if (
      orderedModelIds.length !== favorites.length ||
      orderedModelIds.some((modelId) => !favoriteByModelId.has(modelId))
    ) {
      throw new ConvexError("Reorder list must contain all favorite models");
    }

    const now = Date.now();

    for (const [index, modelId] of orderedModelIds.entries()) {
      const favorite = favoriteByModelId.get(modelId);
      if (favorite && favorite.sortOrder !== index) {
        await ctx.db.patch(favorite._id, {
          sortOrder: index,
          updatedAt: now,
        });
      }
    }
  },
});

export const replaceAll = mutation({
  args: {
    modelIds: v.array(v.string()),
  },
  handler: async (ctx, { modelIds }) => {
    const orderedModelIds = uniqueModelIds(modelIds);
    const favorites = await listFavoriteDocs(ctx);
    const favoriteByModelId = new Map(
      favorites.map((favorite) => [favorite.modelId, favorite] as const),
    );
    const nextModelIds = new Set(orderedModelIds);
    const now = Date.now();

    await markFavoritesInitialized(ctx);

    for (const favorite of favorites) {
      if (!nextModelIds.has(favorite.modelId)) {
        await ctx.db.delete(favorite._id);
      }
    }

    for (const [index, modelId] of orderedModelIds.entries()) {
      const favorite = favoriteByModelId.get(modelId);
      if (favorite) {
        if (favorite.sortOrder !== index) {
          await ctx.db.patch(favorite._id, {
            sortOrder: index,
            updatedAt: now,
          });
        }
        continue;
      }

      await ctx.db.insert("modelFavorites", {
        userId: ctx.userId,
        modelId,
        sortOrder: index,
        fromDefault: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    return orderedModelIds;
  },
});
