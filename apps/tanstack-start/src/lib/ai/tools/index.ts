import type { ToolSet } from "ai";
import { Sandbox } from "@e2b/code-interpreter";
import { webSearch } from "@exalabs/ai-sdk";
import { tool } from "ai";
import { z } from "zod";

import type { MessageSettings } from "@redux/types";
import { getEnabledMessageTools } from "@redux/types";

import { env } from "@/env";

const SANDBOX_UPLOADS_DIR = "/home/user/uploads";

export interface ChatToolAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  url: string;
}

interface ToolRuntimeOptions {
  attachments?: ChatToolAttachment[];
}

interface ToolRuntime {
  cleanup: () => Promise<void>;
  tools: ToolSet;
}

interface SyncedAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  path: string;
}

export function createToolRuntime(
  settings: MessageSettings,
  { attachments = [] }: ToolRuntimeOptions = {},
): ToolRuntime {
  const enabledTools = getEnabledMessageTools(settings.tools);
  const tools: ToolSet = {};
  let sandboxPromise: Promise<Sandbox> | undefined;
  let syncedAttachmentsPromise: Promise<SyncedAttachment[]> | undefined;

  const getSandbox = () => {
    sandboxPromise ??= Sandbox.create();
    return sandboxPromise;
  };

  const syncUploadsToSandbox = async () => {
    if (settings.tools.analysisWorkspace?.syncUploads === false) {
      return [];
    }

    if (attachments.length === 0) {
      return [];
    }

    syncedAttachmentsPromise ??= (async () => {
      const sandbox = await getSandbox();
      const pathCounts = new Map<string, number>();
      const syncedAttachments: SyncedAttachment[] = [];

      for (const attachment of attachments) {
        const response = await fetch(attachment.url);
        if (!response.ok) {
          throw new Error(
            `Failed to download uploaded file "${attachment.fileName}" (${response.status})`,
          );
        }

        const filePath = buildSandboxFilePath(attachment.fileName, pathCounts);
        const content = await response.arrayBuffer();

        await sandbox.files.write(filePath, content);
        syncedAttachments.push({
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          path: filePath,
        });
      }

      return syncedAttachments;
    })();

    return syncedAttachmentsPromise;
  };

  if (enabledTools.includes("search")) {
    tools.search = webSearch();
  }

  if (enabledTools.includes("analysisWorkspace")) {
    const uploadsEnabled =
      settings.tools.analysisWorkspace?.syncUploads !== false;

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

  return {
    tools,
    cleanup: async () => {
      if (!sandboxPromise) {
        return;
      }

      const sandbox = await sandboxPromise;
      await sandbox.kill();
    },
  };
}

function buildSandboxFilePath(
  fileName: string,
  pathCounts: Map<string, number>,
) {
  const safeName = sanitizeFileName(fileName);
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : "";
  const currentCount = pathCounts.get(safeName) ?? 0;
  const nextCount = currentCount + 1;
  pathCounts.set(safeName, nextCount);

  const uniqueName =
    currentCount === 0 ? safeName : `${baseName}-${nextCount}${extension}`;

  return `${SANDBOX_UPLOADS_DIR}/${uniqueName}`;
}

function sanitizeFileName(fileName: string) {
  const sanitized = fileName
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .replaceAll(/[\r\n\t]/g, " ")
    .split("")
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === undefined || codePoint >= 32;
    })
    .join("")
    .replace(/\s+/g, " ");

  return sanitized.length > 0 ? sanitized : "upload";
}
