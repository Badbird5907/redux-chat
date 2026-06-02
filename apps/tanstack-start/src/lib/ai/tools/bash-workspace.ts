import type { ChatToolAttachment } from "@/lib/ai/tools/sandbox";
import type { BashUploadManifestEntry } from "@/server/chat-attachments/bash-uploads";
import { createBashTool } from "bash-tool";
import { Bash, InMemoryFs } from "just-bash";

import {
  BASH_UPLOADS_DIR,
  BASH_UPLOADS_MANIFEST_PATH,
  buildBashUploadManifest,
} from "@/server/chat-attachments/bash-uploads";

const BASH_WORKSPACE_DIR = "/workspace";

interface BashWorkspaceRuntimeOptions {
  attachments: ChatToolAttachment[];
  previousFiles?: Record<string, string | Uint8Array>;
}

export async function createBashWorkspaceRuntime({
  attachments,
  previousFiles,
}: BashWorkspaceRuntimeOptions) {
  const manifest = buildBashUploadManifest(attachments);
  const fs = new InMemoryFs({
    ...previousFiles,
    [BASH_UPLOADS_MANIFEST_PATH]: JSON.stringify(manifest, null, 2),
  });
  await fs.mkdir(BASH_WORKSPACE_DIR, { recursive: true });
  await fs.mkdir(BASH_UPLOADS_DIR, { recursive: true });
  await writeUploadsToFilesystem(fs, manifest, attachments);

  const bash = new Bash({
    cwd: BASH_WORKSPACE_DIR,
    fs,
    network: undefined,
    python: false,
  });

  const toolkit = await createBashTool({
    sandbox: bash,
    destination: BASH_WORKSPACE_DIR,
    extraInstructions: [
      "Use this fast, in-memory Bash workspace for shell commands and filesystem tasks.",
      `Uploaded file metadata is available at ${BASH_UPLOADS_MANIFEST_PATH}.`,
      `Uploaded files are already available at their listed path and idPath under ${BASH_UPLOADS_DIR}.`,
      "Network access and Python are disabled here; use the analysis_workspace tool when you need internet, Python, or system packages.",
      "This filesystem is separate from the analysis_workspace sandbox — files do not transfer between them.",
      "Files you create in /workspace persist between turns — they will still be there when the user sends another message.",
    ].join(" "),
    maxFiles: 0,
  });

  return {
    tools: toolkit.tools,
    fs,
    cleanup: () => Promise.resolve(),
  };
}

async function writeUploadsToFilesystem(
  fs: InMemoryFs,
  manifest: BashUploadManifestEntry[],
  attachments: ChatToolAttachment[],
) {
  const attachmentById = new Map(
    attachments.map((attachment) => [attachment.attachmentId, attachment]),
  );

  for (const item of manifest) {
    const attachment = attachmentById.get(item.attachmentId);
    if (!attachment) {
      continue;
    }

    const content = await attachment.download();
    await fs.writeFile(item.path, content);
    if (item.idPath !== item.path) {
      await fs.writeFile(item.idPath, content);
    }
  }
}
