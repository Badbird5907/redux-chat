import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getEnabledToolSettings } from "@redux/types";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const NOW = 1_700_000_000_000;

function authedTest() {
  return convexTest(schema, modules).withIdentity({ subject: USER_ID });
}

describe("functions/mcpServers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("normalizes server fields and hides auth headers from the public list", async () => {
    const t = authedTest();

    const { mcpServerId } = await t.mutation(api.functions.mcpServers.create, {
      name: "  Local   MCP  ",
      url: "https://example.com/mcp",
      authHeaders: [
        { name: " Authorization ", value: " Bearer test-token " },
        { name: "X-Trace", value: " trace-id " },
        { name: " ", value: " " },
      ],
    });

    await expect(t.query(api.functions.mcpServers.list)).resolves.toEqual([
      {
        mcpServerId,
        name: "Local MCP",
        url: "https://example.com/mcp",
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    await expect(
      t.query(api.functions.mcpServers.listConfigured),
    ).resolves.toEqual([
      {
        mcpServerId,
        name: "Local MCP",
        url: "https://example.com/mcp",
        authHeaders: [
          { name: "Authorization", value: "Bearer test-token" },
          { name: "X-Trace", value: "trace-id" },
        ],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
  });

  it("rejects unsafe or duplicate auth headers", async () => {
    const t = authedTest();

    await expect(
      t.mutation(api.functions.mcpServers.create, {
        name: "MCP",
        url: "https://example.com",
        authHeaders: [
          { name: "Authorization", value: "one" },
          { name: "authorization", value: "two" },
        ],
      }),
    ).rejects.toThrow("Auth header names must be unique");

    await expect(
      t.mutation(api.functions.mcpServers.create, {
        name: "MCP",
        url: "https://example.com",
        authHeaders: [{ name: "Authorization", value: "Bearer\r\nbad" }],
      }),
    ).rejects.toThrow("Auth header value cannot contain new lines");
  });

  it("disables public server lookup without deleting configured servers", async () => {
    const t = authedTest();

    const { mcpServerId } = await t.mutation(api.functions.mcpServers.create, {
      name: "MCP",
      url: "https://example.com/mcp",
    });

    await t.mutation(api.functions.mcpServers.setEnabled, {
      enabled: false,
    });

    await expect(t.query(api.functions.mcpServers.list)).resolves.toEqual([]);
    await expect(
      t.query(api.functions.mcpServers.getByIds, {
        serverIds: [mcpServerId],
      }),
    ).resolves.toEqual([]);

    await expect(
      t.query(api.functions.mcpServers.listConfigured),
    ).resolves.toMatchObject([{ mcpServerId, authHeaders: [] }]);
  });

  it("adds created servers to default message settings", async () => {
    const t = authedTest();

    const { mcpServerId } = await t.mutation(api.functions.mcpServers.create, {
      name: "MCP",
      url: "https://example.com/mcp",
    });

    const defaultSettings = await t.run(async (ctx) => {
      return await ctx.db
        .query("defaultMessageSettings")
        .withIndex("by_userId", (q) => q.eq("userId", USER_ID))
        .first();
    });

    expect(
      getEnabledToolSettings(defaultSettings?.settings.tools, "mcpServers")
        ?.serverIds,
    ).toEqual([mcpServerId]);
  });

  it("removes deleted server ids from default settings and thread settings", async () => {
    const t = authedTest();
    const { mcpServerId } = await t.mutation(api.functions.mcpServers.create, {
      name: "MCP",
      url: "https://example.com/mcp",
    });
    const retainedServerId = "server-to-keep";

    await t.run(async (ctx) => {
      const settings = {
        model: "openai/gpt-5",
        instructionId: "instruction-1",
        tools: {
          mcpServers: {
            serverIds: [mcpServerId, retainedServerId],
          },
        },
      };
      const defaultSettings = await ctx.db
        .query("defaultMessageSettings")
        .withIndex("by_userId", (q) => q.eq("userId", USER_ID))
        .first();

      if (!defaultSettings) {
        throw new Error("Expected default settings to be created");
      }

      await ctx.db.patch(defaultSettings._id, {
        settings,
        updatedAt: NOW,
      });
      await ctx.db.insert("threads", {
        threadId: "thread-1",
        userId: USER_ID,
        name: "Thread",
        status: "completed",
        settings,
        updatedAt: NOW,
      });
    });

    await t.mutation(api.functions.mcpServers.remove, { mcpServerId });

    const stored = await t.run(async (ctx) => {
      const defaultSettings = await ctx.db
        .query("defaultMessageSettings")
        .withIndex("by_userId", (q) => q.eq("userId", USER_ID))
        .first();
      const thread = await ctx.db
        .query("threads")
        .withIndex("by_threadId", (q) => q.eq("threadId", "thread-1"))
        .first();

      return { defaultSettings, thread };
    });

    expect(
      getEnabledToolSettings(
        stored.defaultSettings?.settings.tools,
        "mcpServers",
      )?.serverIds,
    ).toEqual([retainedServerId]);
    expect(
      getEnabledToolSettings(stored.thread?.settings.tools, "mcpServers")
        ?.serverIds,
    ).toEqual([retainedServerId]);
  });

  it("stores an empty MCP server config when deleting the last enabled server", async () => {
    const t = authedTest();
    const { mcpServerId } = await t.mutation(api.functions.mcpServers.create, {
      name: "MCP",
      url: "https://example.com/mcp",
    });

    await t.mutation(api.functions.mcpServers.remove, { mcpServerId });

    const defaultSettings = await t.run(async (ctx) =>
      ctx.db
        .query("defaultMessageSettings")
        .withIndex("by_userId", (q) => q.eq("userId", USER_ID))
        .first(),
    );

    expect(
      getEnabledToolSettings(defaultSettings?.settings.tools, "mcpServers")
        ?.serverIds,
    ).toEqual([]);
  });
});
