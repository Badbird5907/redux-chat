import type { ChatToolAttachment } from "@/lib/ai/tools/sandbox";
import type { ToolSet } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { webSearch } from "@exalabs/ai-sdk";
import { tool } from "ai";
import { z } from "zod";

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
  }[];
  projectContext?: {
    chatProjectId: string;
    userId: string;
  };
}

interface ToolRuntime {
  cleanup: () => Promise<void>;
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

  let sandboxRuntime: ReturnType<typeof createSandboxRuntime> | undefined;
  const mcpClients: Awaited<ReturnType<typeof createMCPClient>>[] = [];

  if (enabledTools.includes("search")) {
    tools.search = webSearch();
  }

  if (enabledTools.includes("analysisWorkspace")) {
    const uploadsEnabled =
      settings.tools.analysisWorkspace?.syncUploads !== false;

    sandboxRuntime = createSandboxRuntime({
      attachments,
      syncUploads: uploadsEnabled,
    });

    const { getSandbox, syncUploadsToSandbox } = sandboxRuntime;

    tools.analysis_workspace = tool({
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
          error: execution.error,
          logs: execution.logs,
          results: execution.results,
          text: execution.text,
          uploadedFiles,
        };
      },
    });
  }

  if (enabledTools.includes("mcpServers")) {
    for (const server of mcpServers) {
      const client = await createMCPClient({
        name: `redux-chat-${server.mcpServerId}`,
        transport: {
          type: "http",
          url: server.url,
          redirect: "error",
        },
      });
      mcpClients.push(client);

      const serverTools = await client.tools();
      const prefix = toToolKeyPrefix(server.name);

      for (const [toolName, toolDefinition] of Object.entries(serverTools)) {
        tools[`mcp_${prefix}_${toolName}`] = toolDefinition as ToolSet[string];
      }
    }
  }

  if (projectContext) {
    tools.search_project_knowledge = searchProjectKnowledgeTool({
      ...projectContext,
      modelId: settings.model,
    });
  }

  return {
    tools,
    cleanup: async () => {
      await Promise.allSettled(mcpClients.map((client) => client.close()));
      await sandboxRuntime?.cleanup();
    },
  };
}
