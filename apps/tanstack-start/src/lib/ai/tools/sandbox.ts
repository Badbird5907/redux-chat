import { Sandbox } from "@e2b/code-interpreter";

export const SANDBOX_UPLOADS_DIR = "/home/user/uploads";

export interface ChatToolAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  url: string;
}

interface SyncedAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  path: string;
}

export function createSandboxRuntime(options: {
  attachments: ChatToolAttachment[];
  syncUploads: boolean;
}) {
  let sandboxPromise: Promise<Sandbox> | undefined;
  let syncedAttachmentsPromise: Promise<SyncedAttachment[]> | undefined;

  const getSandbox = () => {
    sandboxPromise ??= Sandbox.create();
    return sandboxPromise;
  };

  const syncUploadsToSandbox = async (): Promise<SyncedAttachment[]> => {
    if (!options.syncUploads || options.attachments.length === 0) {
      return [];
    }

    syncedAttachmentsPromise ??= (async () => {
      const sandbox = await getSandbox();
      const pathCounts = new Map<string, number>();
      const syncedAttachments: SyncedAttachment[] = [];

      for (const attachment of options.attachments) {
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

  const cleanup = async () => {
    if (!sandboxPromise) {
      return;
    }

    const sandbox = await sandboxPromise;
    await sandbox.kill();
  };

  return { getSandbox, syncUploadsToSandbox, cleanup };
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
