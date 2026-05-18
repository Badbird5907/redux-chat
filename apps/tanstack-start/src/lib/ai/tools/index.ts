import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import type { ChatToolAttachment } from "@/lib/ai/tools/sandbox";
import type { ToolSet } from "ai";
import type { Value } from "convex/values";
import { createMCPClient } from "@ai-sdk/mcp";
import { webSearch } from "@exalabs/ai-sdk";
import { tool } from "ai";
import { z } from "zod";

import type { BillableToolCall, ToolBillingKey } from "@redux/shared";
import type { MessageSettings } from "@redux/types";
import { getEnabledMessageTools } from "@redux/types";

import {
  createSandboxRuntime,
  SANDBOX_UPLOADS_DIR,
} from "@/lib/ai/tools/sandbox";
import { searchProjectKnowledgeTool } from "@/lib/ai/tools/search-project";

export type { ChatToolAttachment };

interface ToolRuntimeOptions {
  attachments?: ChatToolAttachment[];
  mcpServers?: {
    mcpServerId: string;
    name: string;
    url: string;
    authHeaders?: {
      name: string;
      value: string;
    }[];
  }[];
  projectContext?: {
    chatProjectId: string;
    userId: string;
  };
}

interface ToolRuntime {
  cleanup: () => Promise<void>;
  getBillableToolCalls: () => BillableToolCall[];
  tools: ToolSet;
}

function toToolKeyPrefix(name: string) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "server";
}

function isBlockedIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true;
  }
  const [a = 0, b = 0] = parts;
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

function isBlockedIpv6(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) {
    return true;
  }

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("ff")
  );
}

function isBlockedIpAddress(address: string) {
  const normalized = address.replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) return isBlockedIpv4(normalized);
  if (family === 6) return isBlockedIpv6(normalized);
  return true;
}

function getUrlHostname(parsed: URL) {
  return parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.+$/g, "");
}

async function resolvePublicMcpAddresses(hostname: string) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => isBlockedIpAddress(address))
  ) {
    throw new Error("MCP server URL must resolve only to public addresses.");
  }

  return addresses;
}

async function assertPublicMcpServerUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    throw new Error("MCP server URL is not allowed.");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("MCP server URL port is not allowed.");
  }

  const hostname = getUrlHostname(parsed);
  const hostnameIpFamily = isIP(hostname);
  if (
    hostname === "localhost" ||
    hostname === "metadata" ||
    hostname === "metadata.google.internal" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (hostnameIpFamily !== 0 && isBlockedIpAddress(hostname))
  ) {
    throw new Error("MCP server URL must resolve to a public address.");
  }

  if (hostnameIpFamily === 0) {
    await resolvePublicMcpAddresses(hostname);
  }
}

async function createMcpFetch(url: string): Promise<typeof fetch> {
  const parsed = new URL(url);
  const hostname = getUrlHostname(parsed);

  return async (input, init) => {
    const requestUrl = new URL(
      typeof input === "string" || input instanceof URL
        ? input.toString()
        : input.url,
    );
    if (getUrlHostname(requestUrl) !== hostname) {
      throw new Error("MCP request hostname changed unexpectedly.");
    }

    const addresses =
      isIP(hostname) === 0
        ? await resolvePublicMcpAddresses(hostname)
        : [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
    const selected = addresses[0];
    if (!selected || isBlockedIpAddress(selected.address)) {
      throw new Error("MCP server URL must resolve to a public address.");
    }

    return await new Promise<Response>((resolve, reject) => {
      const headers = new Headers(init?.headers);
      const request = httpsRequest(
        {
          hostname,
          method: init?.method ?? "GET",
          path: `${requestUrl.pathname}${requestUrl.search}`,
          port: requestUrl.port ? Number(requestUrl.port) : 443,
          headers: Object.fromEntries(headers.entries()),
          lookup: (_host, _options, callback) => {
            callback(null, selected.address, selected.family);
          },
        },
        (response) => {
          resolve(
            new Response(Readable.toWeb(response) as ReadableStream, {
              status: response.statusCode,
              statusText: response.statusMessage,
              headers: response.headers as HeadersInit,
            }),
          );
        },
      );

      request.on("error", reject);
      request.end(init?.body as Parameters<typeof request.end>[0]);
    });
  };
}

export async function createToolRuntime(
  settings: MessageSettings,
  {
    attachments = [],
    mcpServers = [],
    projectContext,
  }: ToolRuntimeOptions = {},
): Promise<ToolRuntime> {
  const enabledTools = getEnabledMessageTools(settings.tools);
  const tools: ToolSet = {};
  const toolUsageCounts = new Map<string, number>();

  let sandboxRuntime: ReturnType<typeof createSandboxRuntime> | undefined;
  const mcpClients: Awaited<ReturnType<typeof createMCPClient>>[] = [];

  if (enabledTools.includes("search")) {
    tools.search = instrumentTool(webSearch(), "search", toolUsageCounts);
  }

  if (enabledTools.includes("analysisWorkspace")) {
    const uploadsEnabled =
      settings.tools.analysisWorkspace?.syncUploads !== false;

    sandboxRuntime = createSandboxRuntime({
      attachments,
      syncUploads: uploadsEnabled,
    });

    const { getSandbox, syncUploadsToSandbox } = sandboxRuntime;

    tools.analysis_workspace = instrumentTool(
      tool({
        description: uploadsEnabled
          ? [
              "Execute Python code in a Jupyter notebook cell and return the result.",
              "Use this for calculations, tabular analysis, charting, parsing files, or validating outputs.",
              `Before execution, uploaded chat files are synced into ${SANDBOX_UPLOADS_DIR}.`,
            ].join(" ")
          : "Execute Python code in a Jupyter notebook cell and return the result. Use this for calculations, tabular analysis, charting, parsing files, or validating outputs.",
        inputSchema: z.object({
          code: z
            .string()
            .describe("The Python code to execute in a single notebook cell."),
        }),
        execute: async ({ code }) => {
          const sandbox = await getSandbox();
          const uploadedFiles = await syncUploadsToSandbox();
          const execution = await sandbox.runCode(code);

          return {
            error: toConvexSafeValue(execution.error) ?? null,
            logs: toConvexSafeValue(execution.logs) ?? {
              stdout: [],
              stderr: [],
            },
            results: toConvexSafeValue(execution.results) ?? [],
            text: execution.text ?? null,
            uploadedFiles,
          };
        },
      }),
      "analysis_workspace",
      toolUsageCounts,
    );
  }

  if (enabledTools.includes("mcpServers")) {
    for (const server of mcpServers) {
      await assertPublicMcpServerUrl(server.url);
      const mcpFetch = await createMcpFetch(server.url);
      const client = await createMCPClient({
        name: `redux-chat-${server.mcpServerId}`,
        transport: {
          type: "http",
          url: server.url,
          headers: Object.fromEntries(
            (server.authHeaders ?? []).map((header) => [
              header.name,
              header.value,
            ]),
          ),
          redirect: "error",
          fetch: mcpFetch,
        },
      });
      mcpClients.push(client);

      const serverTools = await client.tools();
      const prefix = toToolKeyPrefix(server.name);
      const billingKey = `mcp:${prefix}` satisfies ToolBillingKey;

      for (const [toolName, toolDefinition] of Object.entries(serverTools) as [
        string,
        ToolSet[string],
      ][]) {
        tools[`mcp_${prefix}_${toolName}`] = instrumentTool(
          toolDefinition,
          billingKey,
          toolUsageCounts,
        );
      }
    }
  }

  if (projectContext) {
    tools.search_project_knowledge = instrumentTool(
      searchProjectKnowledgeTool({
        ...projectContext,
        modelId: settings.model,
      }),
      "search_project_knowledge",
      toolUsageCounts,
    );
  }

  return {
    getBillableToolCalls: () =>
      Array.from(toolUsageCounts.entries()).map(
        ([billingKey, invocationCount]) => ({
          billingKey,
          invocationCount,
        }),
      ),
    tools,
    cleanup: async () => {
      await Promise.allSettled(mcpClients.map((client) => client.close()));
      await sandboxRuntime?.cleanup();
    },
  };
}

function instrumentTool(
  definition: ToolSet[string],
  billingKey: string,
  usageCounts: Map<string, number>,
) {
  const candidate = definition as ToolSet[string] & {
    execute?: (...args: unknown[]) => unknown;
  };
  const execute = candidate.execute;
  if (typeof execute !== "function") {
    return definition;
  }

  return {
    ...candidate,
    execute: async (...args: unknown[]) => {
      usageCounts.set(billingKey, (usageCounts.get(billingKey) ?? 0) + 1);
      return toConvexSafeValue(await execute(...args)) ?? null;
    },
  } satisfies ToolSet[string];
}

function toConvexSafeValue(
  value: unknown,
  seen = new WeakSet<object>(),
): Value | undefined {
  if (value === undefined || typeof value === "function") {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  if (value instanceof ArrayBuffer) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return Array.from(new Uint8Array(value.buffer.slice(0)));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => toConvexSafeValue(item, seen) ?? null);
  }

  if (typeof value !== "object") {
    return undefined;
  }

  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  const output: Record<string, Value> = {};
  for (const [key, item] of Object.entries(value)) {
    const safeItem = toConvexSafeValue(item, seen);
    if (safeItem !== undefined) {
      output[key] = safeItem;
    }
  }

  return output;
}
