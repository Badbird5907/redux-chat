import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import { mergeMessageSettings } from "@redux/types";

import type { DataModel, Doc } from "../_generated/dataModel";
import { mutation, query } from "./index";

const MAX_AUTH_HEADERS = 20;
const MAX_HEADER_NAME_LENGTH = 128;
const MAX_HEADER_VALUE_LENGTH = 4096;
const headerNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

interface McpAuthHeaderInput {
  name: string;
  value: string;
}

type AuthenticatedCtx = (
  | GenericQueryCtx<DataModel>
  | GenericMutationCtx<DataModel>
) & {
  userId: string;
};

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

function normalizeMcpAuthHeaders(
  authHeaders: McpAuthHeaderInput[] | undefined,
) {
  if (!authHeaders || authHeaders.length === 0) {
    return [];
  }

  if (authHeaders.length > MAX_AUTH_HEADERS) {
    throw new ConvexError(
      `MCP servers support up to ${MAX_AUTH_HEADERS} auth headers`,
    );
  }

  const seenNames = new Set<string>();
  const normalizedHeaders: McpAuthHeaderInput[] = [];

  for (const header of authHeaders) {
    const name = header.name.trim();
    const value = header.value.trim();

    if (!name && !value) {
      continue;
    }

    if (!name || !value) {
      throw new ConvexError("Auth header name and value are required");
    }

    if (name.length > MAX_HEADER_NAME_LENGTH) {
      throw new ConvexError("Auth header name is too long");
    }

    if (value.length > MAX_HEADER_VALUE_LENGTH) {
      throw new ConvexError("Auth header value is too long");
    }

    if (!headerNamePattern.test(name)) {
      throw new ConvexError("Auth header name contains invalid characters");
    }

    if (/[\r\n]/.test(value)) {
      throw new ConvexError("Auth header value cannot contain new lines");
    }

    const normalizedName = name.toLowerCase();
    if (seenNames.has(normalizedName)) {
      throw new ConvexError("Auth header names must be unique");
    }

    seenNames.add(normalizedName);
    normalizedHeaders.push({ name, value });
  }

  return normalizedHeaders;
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

async function getMcpServersEnabled(ctx: AuthenticatedCtx) {
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .first();

  return settings?.mcpServersEnabled !== false;
}

async function setMcpServersEnabled(
  ctx: GenericMutationCtx<DataModel> & { userId: string },
  enabled: boolean,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      mcpServersEnabled: enabled,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("userSettings", {
    userId: ctx.userId,
    mcpServersEnabled: enabled,
    updatedAt: now,
  });
}

function stripDeletedServerIdFromSettings<
  T extends Doc<"defaultMessageSettings"> | Doc<"threads">,
>(doc: T, mcpServerId: string) {
  const currentIds = doc.settings.tools.mcpServers?.serverIds ?? [];
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

async function addServerIdToDefaultSettings(
  ctx: GenericMutationCtx<DataModel> & { userId: string },
  mcpServerId: string,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("defaultMessageSettings")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .first();
  const currentServerIds =
    existing?.settings.tools.mcpServers?.serverIds ?? [];
  const settings = mergeMessageSettings(existing?.settings, {
    tools: {
      mcpServers: {
        serverIds: [...currentServerIds, mcpServerId],
      },
    },
  });

  if (existing) {
    await ctx.db.patch(existing._id, {
      settings,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.insert("defaultMessageSettings", {
    userId: ctx.userId,
    settings,
    updatedAt: now,
  });
}

async function listConfiguredServers(
  ctx: AuthenticatedCtx,
  options: { includeAuthHeaders: boolean },
) {
  const servers = await ctx.db
    .query("mcpServers")
    .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
    .order("desc")
    .collect();

  return servers.map((server) => ({
    mcpServerId: server.mcpServerId,
    name: server.name,
    url: server.url,
    ...(options.includeAuthHeaders
      ? { authHeaders: server.authHeaders ?? [] }
      : {}),
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  }));
}

export const getSettings = query({
  args: {},
  handler: async (ctx) => ({
    enabled: await getMcpServersEnabled(ctx),
  }),
});

export const setEnabled = mutation({
  args: {
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    await setMcpServersEnabled(ctx, args.enabled);
    return { enabled: args.enabled };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    if (!(await getMcpServersEnabled(ctx))) {
      return [];
    }

    return listConfiguredServers(ctx, { includeAuthHeaders: false });
  },
});

export const listConfigured = query({
  args: {},
  handler: async (ctx) => {
    return listConfiguredServers(ctx, { includeAuthHeaders: true });
  },
});

export const getByIds = query({
  args: {
    serverIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (!(await getMcpServersEnabled(ctx))) {
      return [];
    }

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
          authHeaders: server.authHeaders ?? [],
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
    authHeaders: v.optional(
      v.array(
        v.object({
          name: v.string(),
          value: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const mcpServerId = crypto.randomUUID();
    const authHeaders = normalizeMcpAuthHeaders(args.authHeaders);

    await ctx.db.insert("mcpServers", {
      mcpServerId,
      userId: ctx.userId,
      name: normalizeMcpServerName(args.name),
      url: normalizeMcpServerUrl(args.url),
      authHeaders: authHeaders.length > 0 ? authHeaders : undefined,
      createdAt: now,
      updatedAt: now,
    });

    await addServerIdToDefaultSettings(ctx, mcpServerId);

    return { mcpServerId };
  },
});

export const update = mutation({
  args: {
    mcpServerId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      url: v.optional(v.string()),
      authHeaders: v.optional(
        v.array(
          v.object({
            name: v.string(),
            value: v.string(),
          }),
        ),
      ),
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
    const nextAuthHeaders =
      args.patch.authHeaders !== undefined
        ? normalizeMcpAuthHeaders(args.patch.authHeaders)
        : (server.authHeaders ?? []);

    await ctx.db.patch(server._id, {
      name: nextName,
      url: nextUrl,
      authHeaders: nextAuthHeaders.length > 0 ? nextAuthHeaders : undefined,
      updatedAt: Date.now(),
    });

    return {
      mcpServerId: server.mcpServerId,
      name: nextName,
      url: nextUrl,
      authHeaders: nextAuthHeaders,
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
