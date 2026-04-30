import type { GenericMutationCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import { mergeMessageSettings } from "@redux/types";

import type { DataModel, Doc } from "../_generated/dataModel";
import { mutation, query } from "./index";

function normalizeMcpServerName(name: string) {
  const normalized = name.trim().replace(/\s+/g, " ").slice(0, 80);

  if (!normalized) {
    throw new ConvexError("Server name is required");
  }

  return normalized;
}

function normalizeMcpServerUrl(url: string) {
  const normalized = url.trim();

  if (!normalized) {
    throw new ConvexError("Server URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new ConvexError("Server URL must be a valid absolute URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ConvexError("Only HTTP and HTTPS MCP servers are supported");
  }

  return parsed.toString();
}

async function getMcpServerForUser(
  ctx: GenericMutationCtx<DataModel> & { userId: string },
  mcpServerId: string,
) {
  const server = await ctx.db
    .query("mcpServers")
    .withIndex("by_mcpServerId", (q) => q.eq("mcpServerId", mcpServerId))
    .first();

  if (server?.userId !== ctx.userId) {
    throw new ConvexError("MCP server not found");
  }

  return server;
}

function stripDeletedServerIdFromSettings<
  T extends Doc<"defaultMessageSettings"> | Doc<"threads">,
>(doc: T, mcpServerId: string) {
  const currentIds = doc.settings.tools?.mcpServers?.serverIds ?? [];
  const nextIds = currentIds.filter((serverId) => serverId !== mcpServerId);

  if (nextIds.length === currentIds.length) {
    return undefined;
  }

  return mergeMessageSettings(doc.settings, {
    tools: {
      ...doc.settings.tools,
      mcpServers: nextIds.length > 0 ? { serverIds: nextIds } : undefined,
    },
  });
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const servers = await ctx.db
      .query("mcpServers")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .collect();

    return servers.map((server) => ({
      mcpServerId: server.mcpServerId,
      name: server.name,
      url: server.url,
      createdAt: server.createdAt,
      updatedAt: server.updatedAt,
    }));
  },
});

export const getByIds = query({
  args: {
    serverIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const uniqueServerIds = Array.from(new Set(args.serverIds));

    if (uniqueServerIds.length === 0) {
      return [];
    }

    const servers = await Promise.all(
      uniqueServerIds.map(async (mcpServerId) => {
        const server = await ctx.db
          .query("mcpServers")
          .withIndex("by_mcpServerId", (q) => q.eq("mcpServerId", mcpServerId))
          .first();

        if (server?.userId !== ctx.userId) {
          return null;
        }

        return {
          mcpServerId: server.mcpServerId,
          name: server.name,
          url: server.url,
        };
      }),
    );

    return servers.filter((server) => server !== null);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const mcpServerId = crypto.randomUUID();

    await ctx.db.insert("mcpServers", {
      mcpServerId,
      userId: ctx.userId,
      name: normalizeMcpServerName(args.name),
      url: normalizeMcpServerUrl(args.url),
      createdAt: now,
      updatedAt: now,
    });

    return { mcpServerId };
  },
});

export const update = mutation({
  args: {
    mcpServerId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      url: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const server = await getMcpServerForUser(ctx, args.mcpServerId);

    const nextName =
      args.patch.name !== undefined
        ? normalizeMcpServerName(args.patch.name)
        : server.name;
    const nextUrl =
      args.patch.url !== undefined
        ? normalizeMcpServerUrl(args.patch.url)
        : server.url;

    await ctx.db.patch(server._id, {
      name: nextName,
      url: nextUrl,
      updatedAt: Date.now(),
    });

    return {
      mcpServerId: server.mcpServerId,
      name: nextName,
      url: nextUrl,
    };
  },
});

export const remove = mutation({
  args: {
    mcpServerId: v.string(),
  },
  handler: async (ctx, args) => {
    const server = await getMcpServerForUser(ctx, args.mcpServerId);

    const defaultSettings = await ctx.db
      .query("defaultMessageSettings")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .first();
    const nextDefaultSettings =
      defaultSettings &&
      stripDeletedServerIdFromSettings(defaultSettings, args.mcpServerId);
    if (defaultSettings && nextDefaultSettings) {
      await ctx.db.patch(defaultSettings._id, {
        settings: nextDefaultSettings,
        updatedAt: Date.now(),
      });
    }

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();
    await Promise.all(
      threads.map(async (thread) => {
        const nextSettings = stripDeletedServerIdFromSettings(
          thread,
          args.mcpServerId,
        );

        if (!nextSettings) {
          return;
        }

        await ctx.db.patch(thread._id, {
          settings: nextSettings,
          updatedAt: Date.now(),
        });
      }),
    );

    await ctx.db.delete(server._id);

    return { success: true as const };
  },
});
