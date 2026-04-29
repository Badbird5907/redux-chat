import type { ChatToolAttachment } from "@/lib/ai/tools/sandbox";
import type { ToolSet } from "ai";
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
  projectContext?: {
    chatProjectId: string;
    userId: string;
  };
}

interface ToolRuntime {
  cleanup: () => Promise<void>;
  tools: ToolSet;
}

export function createToolRuntime(
  settings: MessageSettings,
  { attachments = [], projectContext }: ToolRuntimeOptions = {},
): ToolRuntime {
  const enabledTools = getEnabledMessageTools(settings.tools);
  const tools: ToolSet = {};

  let sandboxRuntime: ReturnType<typeof createSandboxRuntime> | undefined;

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

  if (projectContext) {
    tools.search_project_knowledge = searchProjectKnowledgeTool({
      ...projectContext,
      modelId: settings.model,
    });
  }

  return {
    tools,
    cleanup: async () => {
      await sandboxRuntime?.cleanup();
    },
  };
}
