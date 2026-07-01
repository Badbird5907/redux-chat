import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import type { ChatToolAttachment } from "@/lib/ai/tools/sandbox";
import type { OAuthClientProvider, OAuthTokens } from "@ai-sdk/mcp";
import type { ToolApprovalStatus, ToolSet } from "ai";
import type { Value } from "convex/values";
import type { InMemoryFs } from "just-bash";
import { createMCPClient } from "@ai-sdk/mcp";
import { webSearch } from "@exalabs/ai-sdk";
import { generateImage, tool } from "ai";
import { z } from "zod";

import type { BillableToolCall, ToolBillingKey } from "@redux/shared";
import type { MessageSettings } from "@redux/types";
import { isImageGenerationToolModel } from "@redux/shared/models";
import { getEnabledMessageTools, getEnabledToolSettings } from "@redux/types";

import { createBashWorkspaceRuntime } from "@/lib/ai/tools/bash-workspace";
import { createPresentFileTool } from "@/lib/ai/tools/present-file";
import {
  createSandboxRuntime,
  SANDBOX_UPLOADS_DIR,
} from "@/lib/ai/tools/sandbox";
import { searchProjectKnowledgeTool } from "@/lib/ai/tools/search-project";
import { storeGeneratedImage } from "@/server/ai/generated-images";
import { resolveAiSdkImageModel } from "@/server/ai/model-runtime";

export type { ChatToolAttachment };

export type McpServerTransport = "http" | "sse";

interface ToolRuntimeOptions {
  attachments?: ChatToolAttachment[];
  mcpServers?: {
    mcpServerId: string;
    name: string;
    url: string;
    transport?: McpServerTransport;
    authHeaders?: {
      name: string;
      value: string;
    }[];
    toolPermissions?: Record<string, "allow" | "ask" | "deny">;
    oauthTokens?: {
      access_token: string;
      token_type: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    oauthClientInfo?: {
      client_id: string;
      client_secret?: string;
    };
    oauthServerMetadata?: {
      authorizationServerUrl: string;
      tokenEndpoint: string;
    };
  }[];
  onOAuthTokensRefreshed?: (
    mcpServerId: string,
    tokens: OAuthTokens,
  ) => Promise<void>;
  projectContext?: {
    chatProjectId: string;
    userId: string;
  };
  generationContext?: {
    userId: string;
    threadId: string;
    messageId: string;
  };
  previousBashFiles?: Record<string, string | Uint8Array>;
}

interface ToolRuntime {
  cleanup: () => Promise<void>;
  getBillableToolCalls: () => BillableToolCall[];
  tools: ToolSet;
  getBashFs: () => InMemoryFs | undefined;
  mcpToolApproval: Record<string, ToolApprovalStatus>;
}

const MAX_TOOL_RESULT_STRING_CHARS = 100_000;
const MAX_TOOL_RESULT_ARRAY_ITEMS = 200;
const BINARY_SAMPLE_SIZE = 256;

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

export function assertAllowedMcpServerUrl(url: string) {
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
}

export function createMcpFetch(url: string): typeof fetch {
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

    if (requestUrl.protocol !== "https:") {
      throw new Error("MCP request must use HTTPS protocol.");
    }

    const port = requestUrl.port;
    if (port && port !== "443") {
      throw new Error("MCP request must use port 443 or default HTTPS port.");
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
      let cleanedUp = false;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        clearTimeout(timeoutId);
        if (init?.signal) {
          init.signal.removeEventListener("abort", abortHandler);
        }
      };

      const abortHandler = () => {
        cleanup();
        request.destroy(new Error("Request aborted"));
        reject(new Error("Request aborted"));
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        request.destroy(new Error("Request timeout"));
        reject(new Error("MCP request timeout"));
      }, 30000);

      if (init?.signal) {
        if (init.signal.aborted) {
          cleanup();
          reject(new Error("Request aborted"));
          return;
        }
        init.signal.addEventListener("abort", abortHandler);
      }

      const request = httpsRequest(
        {
          hostname,
          method: init?.method ?? "GET",
          path: `${requestUrl.pathname}${requestUrl.search}`,
          port: requestUrl.port ? Number(requestUrl.port) : 443,
          headers: Object.fromEntries(headers.entries()),
          lookup: (_host, options, callback) => {
            if (typeof options === "object" && options.all) {
              callback(null, [
                { address: selected.address, family: selected.family },
              ]);
              return;
            }

            callback(null, selected.address, selected.family);
          },
        },
        (response) => {
          cleanup();
          resolve(
            new Response(Readable.toWeb(response) as ReadableStream, {
              status: response.statusCode,
              statusText: response.statusMessage,
              headers: response.headers as HeadersInit,
            }),
          );
        },
      );

      request.on("error", (error) => {
        cleanup();
        reject(error);
      });

      request.on("socket", (socket) => {
        socket.setTimeout(30000);
        socket.on("timeout", () => {
          cleanup();
          request.destroy(new Error("Socket timeout"));
          reject(new Error("MCP socket timeout"));
        });
      });

      request.end(init?.body as Parameters<typeof request.end>[0]);
    });
  };
}

export function createMcpTransport({
  url,
  transport,
  headers,
  authProvider,
}: {
  url: string;
  transport?: McpServerTransport;
  headers?: Record<string, string>;
  authProvider?: OAuthClientProvider;
}) {
  return {
    type: transport ?? "http",
    url,
    headers,
    authProvider,
    redirect: "error" as const,
    fetch: createMcpFetch(url),
  };
}

export async function createToolRuntime(
  settings: MessageSettings,
  {
    attachments = [],
    mcpServers = [],
    onOAuthTokensRefreshed,
    projectContext,
    generationContext,
    previousBashFiles,
  }: ToolRuntimeOptions = {},
): Promise<ToolRuntime> {
  const enabledTools = getEnabledMessageTools(settings.tools);
  const tools: ToolSet = {};
  const toolUsageCounts = new Map<string, number>();

  let sandboxRuntime: ReturnType<typeof createSandboxRuntime> | undefined;
  let bashWorkspaceRuntime:
    | Awaited<ReturnType<typeof createBashWorkspaceRuntime>>
    | undefined;
  const mcpClients: Awaited<ReturnType<typeof createMCPClient>>[] = [];

  if (enabledTools.includes("search")) {
    tools.search = instrumentTool(webSearch(), "search", toolUsageCounts);
  }

  if (enabledTools.includes("bashWorkspace")) {
    bashWorkspaceRuntime = await createBashWorkspaceRuntime({
      attachments,
      previousFiles: previousBashFiles,
    });
    tools.bash = instrumentTool(
      bashWorkspaceRuntime.tools.bash,
      "bash_workspace",
      toolUsageCounts,
    );
    tools.readFile = instrumentTool(
      bashWorkspaceRuntime.tools.readFile,
      "bash_workspace",
      toolUsageCounts,
    );
    tools.writeFile = instrumentTool(
      bashWorkspaceRuntime.tools.writeFile,
      "bash_workspace",
      toolUsageCounts,
    );
  }

  if (enabledTools.includes("analysisWorkspace")) {
    const uploadsEnabled =
      getEnabledToolSettings(settings.tools, "analysisWorkspace")
        ?.syncUploads !== false;

    sandboxRuntime = createSandboxRuntime({
      attachments,
      syncUploads: uploadsEnabled,
    });

    const { getSandbox, getUploadManifest, syncUploadsToSandbox } =
      sandboxRuntime;

    tools.analysis_workspace = instrumentTool(
      tool({
        description: [
          "Run Python or bash in a full Linux sandbox (cloud VM) with internet access, and return the result.",
          "Use this when you need Python, plotting, package installs, system tools, or network access. Set language to 'bash' to run shell commands here.",
          "This sandbox has its own filesystem that is separate from the Bash tool — files do not transfer between them.",
          uploadsEnabled
            ? `Uploaded chat file metadata is available in the tool result as uploadManifest. To sync uploaded files into ${SANDBOX_UPLOADS_DIR}, pass the specific attachmentIds needed for this call.`
            : "",
        ]
          .filter(Boolean)
          .join(" "),
        inputSchema: z.object({
          code: z
            .string()
            .describe(
              "The Python (or bash, when language is 'bash') code to execute in a single cell.",
            ),
          language: z
            .enum(["python", "bash"])
            .optional()
            .describe(
              "Language to execute. Defaults to 'python'. Use 'bash' to run shell commands in this sandbox.",
            ),
          attachmentIds: z
            .array(z.string())
            .optional()
            .describe(
              "Optional uploaded attachment IDs to sync into the analysis workspace before execution.",
            ),
        }),
        execute: async ({ code, language, attachmentIds }) => {
          const sandbox = await getSandbox();
          const uploadedFiles = await syncUploadsToSandbox(attachmentIds);
          const execution = await sandbox.runCode(
            code,
            language ? { language } : undefined,
          );

          return {
            error: toConvexSafeValue(execution.error) ?? null,
            logs: toConvexSafeValue(execution.logs) ?? {
              stdout: [],
              stderr: [],
            },
            results: toConvexSafeValue(execution.results) ?? [],
            text: execution.text ?? null,
            uploadManifest: getUploadManifest(),
            uploadedFiles,
          };
        },
      }),
      "analysis_workspace",
      toolUsageCounts,
    );
  }

  if (generationContext && (bashWorkspaceRuntime || sandboxRuntime)) {
    tools.present_file = instrumentTool(
      createPresentFileTool({
        generationContext,
        modelId: settings.model,
        sandboxes: {
          bashFs: bashWorkspaceRuntime?.fs,
          readE2bFileBytes: sandboxRuntime?.readFileBytes,
        },
      }),
      "present_file",
      toolUsageCounts,
    );
  }

  const mcpToolApproval: Record<string, ToolApprovalStatus> = {};

  if (enabledTools.includes("mcpServers")) {
    for (const server of mcpServers) {
      assertAllowedMcpServerUrl(server.url);

      const authProvider = server.oauthTokens
        ? createChatOAuthProvider(server, async (tokens) => {
            await onOAuthTokensRefreshed?.(server.mcpServerId, tokens);
          })
        : undefined;

      const client = await createMCPClient({
        name: `redux-chat-${server.mcpServerId}`,
        transport: createMcpTransport({
          url: server.url,
          transport: server.transport,
          headers: Object.fromEntries(
            (server.authHeaders ?? []).map((header) => [
              header.name,
              header.value,
            ]),
          ),
          authProvider,
        }),
      });
      mcpClients.push(client);

      const serverTools = await client.tools();
      const prefix = toToolKeyPrefix(server.name);
      const billingKey = `mcp:${prefix}` satisfies ToolBillingKey;
      const permissions = server.toolPermissions ?? {};

      for (const [toolName, toolDefinition] of Object.entries(serverTools) as [
        string,
        ToolSet[string],
      ][]) {
        const qualifiedName = `mcp_${prefix}_${toolName}`;
        const permission = permissions[toolName];

        if (permission === "deny") {
          // Skip registering denied tools entirely
          continue;
        }

        tools[qualifiedName] = instrumentTool(
          toolDefinition,
          billingKey,
          toolUsageCounts,
        );

        if (permission === "ask") {
          mcpToolApproval[qualifiedName] = "user-approval";
        }
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

  if (enabledTools.includes("imageGeneration")) {
    const modelId = getEnabledToolSettings(
      settings.tools,
      "imageGeneration",
    )?.modelId;
    if (modelId && generationContext && isImageGenerationToolModel(modelId)) {
      tools.generate_image = instrumentTool(
        tool({
          description:
            "Generate an image from a detailed prompt. Use this when the user asks to create, draw, render, or design an image.",
          inputSchema: z.object({
            prompt: z
              .string()
              .min(1)
              .describe("A detailed prompt describing the image to generate."),
          }),
          execute: async ({ prompt }, options) => {
            const resolved = resolveAiSdkImageModel(modelId);
            const result = await generateImage({
              model: resolved.model,
              prompt,
            });
            const toolCallId =
              typeof options === "object" &&
              "toolCallId" in options &&
              typeof options.toolCallId === "string"
                ? options.toolCallId
                : undefined;

            return await storeGeneratedImage({
              ...generationContext,
              modelId,
              route: resolved.route,
              prompt,
              image: result.image,
              toolCallId,
            });
          },
        }),
        "image_generation",
        toolUsageCounts,
      );
    }
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
    getBashFs: () => bashWorkspaceRuntime?.fs,
    mcpToolApproval,
    cleanup: async () => {
      await Promise.allSettled(mcpClients.map((client) => client.close()));
      await sandboxRuntime?.cleanup();
      await bashWorkspaceRuntime?.cleanup();
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

  if (typeof value === "string") {
    if (value.length <= MAX_TOOL_RESULT_STRING_CHARS) {
      return value;
    }

    return `${value.slice(0, MAX_TOOL_RESULT_STRING_CHARS)}\n\n[Tool output truncated: ${value.length - MAX_TOOL_RESULT_STRING_CHARS} additional characters omitted.]`;
  }

  if (typeof value === "boolean" || typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "symbol") {
    return value.toString();
  }

  if (value instanceof ArrayBuffer) {
    return omittedBinaryToolResult(value.byteLength);
  }

  if (ArrayBuffer.isView(value)) {
    return omittedBinaryToolResult(value.byteLength);
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    if (
      value.length > BINARY_SAMPLE_SIZE &&
      value
        .slice(0, BINARY_SAMPLE_SIZE)
        .every(
          (item) =>
            typeof item === "number" &&
            Number.isInteger(item) &&
            item >= 0 &&
            item <= 255,
        )
    ) {
      return omittedBinaryToolResult(value.length);
    }

    const items = value
      .slice(0, MAX_TOOL_RESULT_ARRAY_ITEMS)
      .map((item) => toConvexSafeValue(item, seen) ?? null);
    if (value.length > MAX_TOOL_RESULT_ARRAY_ITEMS) {
      items.push({
        omitted: true,
        omittedItems: value.length - MAX_TOOL_RESULT_ARRAY_ITEMS,
        reason: "Additional tool result items were omitted.",
      });
    }
    return items;
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

function omittedBinaryToolResult(byteLength: number): Value {
  return {
    omitted: true,
    byteLength,
    reason:
      "Binary file contents are not returned inline. Use a text extraction tool or present_file instead.",
  };
}

/**
 * Creates a minimal OAuthClientProvider for use during chat.
 * Provides stored tokens, authorization server info for refresh,
 * and persists refreshed tokens via the onTokensRefreshed callback.
 */
function createChatOAuthProvider(
  server: {
    oauthTokens?: {
      access_token: string;
      token_type: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    oauthClientInfo?: {
      client_id: string;
      client_secret?: string;
    };
    oauthServerMetadata?: {
      authorizationServerUrl: string;
      tokenEndpoint: string;
    };
  },
  onTokensRefreshed?: (tokens: OAuthTokens) => Promise<void>,
): OAuthClientProvider {
  let currentTokens: OAuthTokens | undefined = server.oauthTokens
    ? {
        access_token: server.oauthTokens.access_token,
        token_type: server.oauthTokens.token_type,
        refresh_token: server.oauthTokens.refresh_token,
        expires_in: server.oauthTokens.expires_in,
        scope: server.oauthTokens.scope,
      }
    : undefined;

  return {
    get redirectUrl(): string {
      return "https://localhost/oauth/callback";
    },
    get clientMetadata() {
      return {
        redirect_uris: ["https://localhost/oauth/callback"],
        client_name: "Redux Chat",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none" as const,
      };
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async tokens() {
      return currentTokens;
    },
    async saveTokens(tokens: OAuthTokens) {
      currentTokens = tokens;
      await onTokensRefreshed?.(tokens);
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async redirectToAuthorization() {
      throw new Error(
        "OAuth re-authorization required. Please reconnect in MCP settings.",
      );
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    async saveCodeVerifier() {},
    // eslint-disable-next-line @typescript-eslint/require-await
    async codeVerifier() {
      throw new Error("No code verifier available during chat");
    },
    // eslint-disable-next-line @typescript-eslint/require-await
    async clientInformation() {
      if (!server.oauthClientInfo) return undefined;
      return {
        client_id: server.oauthClientInfo.client_id,
        client_secret: server.oauthClientInfo.client_secret,
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    async saveClientInformation() {},
    // eslint-disable-next-line @typescript-eslint/require-await
    async authorizationServerInformation() {
      if (!server.oauthServerMetadata) return undefined;
      return {
        authorizationServerUrl:
          server.oauthServerMetadata.authorizationServerUrl,
        tokenEndpoint: server.oauthServerMetadata.tokenEndpoint,
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    async saveAuthorizationServerInformation() {},
  };
}
