import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import {
  getEnabledToolSettings,
  mergePersistedMessageSettings,
} from "@redux/types";

import type { DataModel, Doc } from "../_generated/dataModel";
import { mutation, query } from "./index";

const MAX_AUTH_HEADERS = 20;
const MAX_HEADER_NAME_LENGTH = 128;
const MAX_HEADER_VALUE_LENGTH = 4096;
const headerNamePattern = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const blockedMcpHostnames = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata",
]);

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

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255 ||
        String(octet) !== parts[index],
    )
  ) {
    return false;
  }

  const [a = 0, b = 0] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!normalized.includes(":")) {
    return false;
  }

  if (normalized.startsWith("::ffff:")) {
    return true;
  }

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("ff")
  );
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

  if (parsed.protocol !== "https:") {
    throw new ConvexError("MCP server URLs must use HTTPS");
  }

  if (parsed.username || parsed.password) {
    throw new ConvexError("MCP server URLs cannot include credentials");
  }

  if (parsed.port && parsed.port !== "443") {
    throw new ConvexError("MCP server URLs cannot use a custom port");
  }

  const hostname = parsed.hostname.toLowerCase().replace(/\.+$/g, "");
  if (
    blockedMcpHostnames.has(hostname) ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isPrivateIpv4(hostname) ||
    isBlockedIpv6(hostname)
  ) {
    throw new ConvexError("MCP server URL must use a public hostname");
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
  const currentIds =
    getEnabledToolSettings(doc.settings.tools, "mcpServers")?.serverIds ?? [];
  const nextIds = currentIds.filter((serverId) => serverId !== mcpServerId);

  if (nextIds.length === currentIds.length) {
    return undefined;
  }

  return mergePersistedMessageSettings(doc.settings, {
    tools: {
      ...doc.settings.tools,
      mcpServers: { serverIds: nextIds },
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
  const currentServerIds = existing
    ? (getEnabledToolSettings(existing.settings.tools, "mcpServers")
        ?.serverIds ?? [])
    : [];
  const settings = mergePersistedMessageSettings(existing?.settings, {
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
    toolPermissions: server.toolPermissions ?? {},
    hasOAuth: server.oauthTokens !== undefined,
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
          toolPermissions: server.toolPermissions ?? {},
          oauthTokens: server.oauthTokens,
          oauthClientInfo: server.oauthClientInfo,
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

const mcpToolPermission = v.union(
  v.literal("allow"),
  v.literal("ask"),
  v.literal("deny"),
);

export const updateToolPermissions = mutation({
  args: {
    mcpServerId: v.string(),
    toolName: v.string(),
    permission: mcpToolPermission,
  },
  handler: async (ctx, args) => {
    const server = await getMcpServerForUser(ctx, args.mcpServerId);
    const current = server.toolPermissions ?? {};
    const merged = { ...current, [args.toolName]: args.permission };

    const cleaned = Object.fromEntries(
      Object.entries(merged).filter(([, p]) => p !== "allow"),
    );

    await ctx.db.patch(server._id, {
      toolPermissions: Object.keys(cleaned).length > 0 ? cleaned : undefined,
      updatedAt: Date.now(),
    });

    return { mcpServerId: server.mcpServerId };
  },
});

export const bulkSetToolPermissions = mutation({
  args: {
    mcpServerId: v.string(),
    permission: mcpToolPermission,
    toolNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const server = await getMcpServerForUser(ctx, args.mcpServerId);
    const current = server.toolPermissions ?? {};
    const merged = { ...current };
    for (const name of args.toolNames) {
      merged[name] = args.permission;
    }

    const cleaned = Object.fromEntries(
      Object.entries(merged).filter(([, p]) => p !== "allow"),
    );

    await ctx.db.patch(server._id, {
      toolPermissions: Object.keys(cleaned).length > 0 ? cleaned : undefined,
      updatedAt: Date.now(),
    });

    return { mcpServerId: server.mcpServerId };
  },
});

// ---------------------------------------------------------------------------
// OAuth flow management
// ---------------------------------------------------------------------------

const MAX_OAUTH_FLOWS_PER_USER = 10;
const OAUTH_FLOW_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

export const createOAuthFlow = mutation({
  args: {
    mcpServerId: v.string(),
    flowId: v.string(),
    serverUrl: v.string(),
    codeVerifier: v.string(),
    state: v.string(),
    clientId: v.string(),
    clientSecret: v.optional(v.string()),
    authorizationServerUrl: v.string(),
    tokenEndpoint: v.string(),
  },
  handler: async (ctx, args) => {
    await getMcpServerForUser(ctx, args.mcpServerId);

    // Clean up expired flows for this user
    const existingFlows = await ctx.db
      .query("mcpOAuthFlows")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .collect();

    const now = Date.now();
    const expiredFlows = existingFlows.filter(
      (flow) => now - flow.createdAt > OAUTH_FLOW_MAX_AGE_MS,
    );
    for (const flow of expiredFlows) {
      await ctx.db.delete(flow._id);
    }

    const activeFlows = existingFlows.length - expiredFlows.length;
    if (activeFlows >= MAX_OAUTH_FLOWS_PER_USER) {
      throw new ConvexError("Too many pending OAuth flows");
    }

    await ctx.db.insert("mcpOAuthFlows", {
      flowId: args.flowId,
      mcpServerId: args.mcpServerId,
      userId: ctx.userId,
      serverUrl: args.serverUrl,
      codeVerifier: args.codeVerifier,
      state: args.state,
      clientId: args.clientId,
      clientSecret: args.clientSecret,
      authorizationServerUrl: args.authorizationServerUrl,
      tokenEndpoint: args.tokenEndpoint,
      createdAt: now,
    });

    return { flowId: args.flowId };
  },
});

export const getOAuthFlowByState = query({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const flow = await ctx.db
      .query("mcpOAuthFlows")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!flow?.userId || flow.userId !== ctx.userId) {
      return null;
    }

    if (Date.now() - flow.createdAt > OAUTH_FLOW_MAX_AGE_MS) {
      return null;
    }

    return {
      flowId: flow.flowId,
      mcpServerId: flow.mcpServerId,
      serverUrl: flow.serverUrl,
      codeVerifier: flow.codeVerifier,
      state: flow.state,
      clientId: flow.clientId,
      clientSecret: flow.clientSecret,
      authorizationServerUrl: flow.authorizationServerUrl,
      tokenEndpoint: flow.tokenEndpoint,
    };
  },
});

export const saveOAuthTokens = mutation({
  args: {
    mcpServerId: v.string(),
    flowId: v.string(),
    tokens: v.object({
      access_token: v.string(),
      token_type: v.string(),
      refresh_token: v.optional(v.string()),
      expires_in: v.optional(v.number()),
      scope: v.optional(v.string()),
    }),
    clientInfo: v.object({
      client_id: v.string(),
      client_secret: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const server = await getMcpServerForUser(ctx, args.mcpServerId);

    await ctx.db.patch(server._id, {
      oauthTokens: args.tokens,
      oauthClientInfo: args.clientInfo,
      updatedAt: Date.now(),
    });

    // Clean up the flow record
    const flow = await ctx.db
      .query("mcpOAuthFlows")
      .withIndex("by_flowId", (q) => q.eq("flowId", args.flowId))
      .first();
    if (flow?.userId === ctx.userId) {
      await ctx.db.delete(flow._id);
    }

    return { mcpServerId: server.mcpServerId };
  },
});

export const refreshOAuthTokens = mutation({
  args: {
    mcpServerId: v.string(),
    tokens: v.object({
      access_token: v.string(),
      token_type: v.string(),
      refresh_token: v.optional(v.string()),
      expires_in: v.optional(v.number()),
      scope: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const server = await getMcpServerForUser(ctx, args.mcpServerId);

    await ctx.db.patch(server._id, {
      oauthTokens: args.tokens,
      updatedAt: Date.now(),
    });

    return { mcpServerId: server.mcpServerId };
  },
});

export const clearOAuthTokens = mutation({
  args: {
    mcpServerId: v.string(),
  },
  handler: async (ctx, args) => {
    const server = await getMcpServerForUser(ctx, args.mcpServerId);

    await ctx.db.patch(server._id, {
      oauthTokens: undefined,
      oauthClientInfo: undefined,
      updatedAt: Date.now(),
    });

    return { mcpServerId: server.mcpServerId };
  },
});
