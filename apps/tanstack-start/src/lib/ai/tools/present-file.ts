import type { ModelFilePart } from "@/server/ai/model-generated-files";
import type { InMemoryFs } from "just-bash";
import { tool } from "ai";
import { z } from "zod";

import { storeModelPresentedFile } from "@/server/ai/model-generated-files";

// Presented files are uploaded to public Silo storage; cap matches the value
// agreed with the product owner to avoid huge uploads.
const MAX_PRESENT_FILE_BYTES = 15 * 1024 * 1024;

const EXTENSION_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  ico: "image/x-icon",
  avif: "image/avif",
  heic: "image/heic",
  pdf: "application/pdf",
  txt: "text/plain",
  log: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  java: "text/x-java-source",
  ts: "text/plain",
  py: "text/x-python",
  yaml: "application/yaml",
  yml: "application/yaml",
  zip: "application/zip",
  gz: "application/gzip",
  tar: "application/x-tar",
  parquet: "application/vnd.apache.parquet",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function basename(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const segments = normalized.split(/[\\/]/);
  const last = segments[segments.length - 1];
  return last && last.length > 0 ? last : normalized;
}

function inferMimeType(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === fileName.length - 1) {
    return "application/octet-stream";
  }
  const ext = fileName.slice(dotIndex + 1).toLowerCase();
  return EXTENSION_MIME_TYPES[ext] ?? "application/octet-stream";
}

export type PresentFileSource = "bash" | "e2b";

interface PresentFileSandboxes {
  bashFs?: InMemoryFs;
  readE2bFileBytes?: (path: string) => Promise<Uint8Array>;
}

interface CreatePresentFileToolOptions {
  generationContext: {
    userId: string;
    threadId: string;
    messageId: string;
  };
  modelId?: string;
  sandboxes: PresentFileSandboxes;
}

function resolveSource(
  requested: PresentFileSource | undefined,
  sandboxes: PresentFileSandboxes,
): PresentFileSource {
  const hasBash = sandboxes.bashFs !== undefined;
  const hasE2b = sandboxes.readE2bFileBytes !== undefined;

  if (requested === "bash") {
    if (!hasBash) {
      throw new Error("The Bash sandbox is not enabled for this message.");
    }
    return "bash";
  }
  if (requested === "e2b") {
    if (!hasE2b) {
      throw new Error(
        "The analysis_workspace sandbox is not enabled for this message.",
      );
    }
    return "e2b";
  }

  if (hasBash && hasE2b) {
    throw new Error(
      "Both sandboxes are enabled; pass source ('bash' or 'e2b') to choose which filesystem to read from.",
    );
  }
  if (hasBash) {
    return "bash";
  }
  if (hasE2b) {
    return "e2b";
  }
  throw new Error("No sandbox is enabled for this message.");
}

async function readBytes(
  source: PresentFileSource,
  path: string,
  sandboxes: PresentFileSandboxes,
): Promise<Uint8Array> {
  if (source === "bash") {
    const fs = sandboxes.bashFs;
    if (!fs) {
      throw new Error("The Bash sandbox is not enabled for this message.");
    }
    if (!(await fs.exists(path))) {
      throw new Error(`File not found in the Bash sandbox: ${path}`);
    }
    return fs.readFileBuffer(path);
  }

  const readE2b = sandboxes.readE2bFileBytes;
  if (!readE2b) {
    throw new Error(
      "The analysis_workspace sandbox is not enabled for this message.",
    );
  }
  return readE2b(path);
}

export function createPresentFileTool(options: CreatePresentFileToolOptions) {
  return tool({
    description: [
      "Present a file from a sandbox to the user so they can view or download it.",
      "Reads the file from the chosen sandbox, stores it, and renders it in the chat: images are embedded inline, other files appear as a download card.",
      "When both the Bash and analysis_workspace sandboxes are enabled, pass source to choose which one to read from.",
    ].join(" "),
    inputSchema: z.object({
      path: z
        .string()
        .min(1)
        .describe("Absolute path to the file inside the sandbox."),
      displayName: z
        .string()
        .optional()
        .describe(
          "Optional file name to show the user. Defaults to the file name in path.",
        ),
      source: z
        .enum(["bash", "e2b"])
        .optional()
        .describe(
          "Which sandbox to read from: 'bash' for the Bash workspace or 'e2b' for the analysis_workspace. Required only when both are enabled.",
        ),
    }),
    execute: async ({ path, displayName, source }): Promise<ModelFilePart> => {
      const resolvedSource = resolveSource(source, options.sandboxes);
      const bytes = await readBytes(resolvedSource, path, options.sandboxes);

      if (bytes.byteLength > MAX_PRESENT_FILE_BYTES) {
        throw new Error(
          `File is too large to present (${bytes.byteLength} bytes). The limit is ${MAX_PRESENT_FILE_BYTES} bytes.`,
        );
      }

      const trimmedDisplayName = displayName?.trim();
      const fileName = (
        trimmedDisplayName && trimmedDisplayName.length > 0
          ? trimmedDisplayName
          : basename(path)
      ).slice(0, 200);
      const mimeType = inferMimeType(fileName);

      return storeModelPresentedFile({
        userId: options.generationContext.userId,
        threadId: options.generationContext.threadId,
        messageId: options.generationContext.messageId,
        bytes,
        fileName,
        mimeType,
        source: resolvedSource === "bash" ? "shell" : "e2b",
        modelId: options.modelId,
      });
    },
  });
}
