import { Sandbox } from "@e2b/code-interpreter";

export const SANDBOX_UPLOADS_DIR = "/home/user/uploads";

export interface ChatToolAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  download: () => Promise<Uint8Array>;
}

interface SyncedAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
}

export function createSandboxRuntime(options: {
  attachments: ChatToolAttachment[];
  syncUploads: boolean;
}) {
  let sandboxPromise: Promise<Sandbox> | undefined;
  const syncedAttachmentIds = new Set<string>();

  const getSandbox = () => {
    sandboxPromise ??= Sandbox.create();
    return sandboxPromise;
  };

  const getUploadManifest = (): SyncedAttachment[] => {
    const pathCounts = new Map<string, number>();

    return options.attachments.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      path: buildSandboxFilePath(attachment.fileName, pathCounts),
    }));
  };

  const syncUploadsToSandbox = async (
    attachmentIds?: string[],
  ): Promise<SyncedAttachment[]> => {
    if (
      !options.syncUploads ||
      options.attachments.length === 0 ||
      !attachmentIds ||
      attachmentIds.length === 0
    ) {
      return [];
    }

    const requestedIds = new Set(attachmentIds);
    const attachmentsById = new Map(
      options.attachments.map((attachment) => [
        attachment.attachmentId,
        attachment,
      ]),
    );
    const downloads = await Promise.all(
      getUploadManifest()
        .filter(
          (attachment) =>
            requestedIds.has(attachment.attachmentId) &&
            !syncedAttachmentIds.has(attachment.attachmentId),
        )
        .map(async (attachment) => {
          const source = attachmentsById.get(attachment.attachmentId);
          if (!source) {
            throw new Error(`Unknown attachmentId: ${attachment.attachmentId}`);
          }

          return {
            ...attachment,
            contentBase64: Buffer.from(await source.download()).toString(
              "base64",
            ),
          };
        }),
    );

    if (downloads.length > 0) {
      const sandbox = await getSandbox();
      const result = await sandbox.runCode(buildSandboxUploadCode(downloads), {
        timeoutMs: Math.max(60_000, downloads.length * 60_000),
      });

      const stdout = result.logs.stdout.join("\n").trim();
      const stderr = result.logs.stderr.join("\n").trim();
      if (result.error) {
        throw new Error(
          formatSandboxSyncError(result.error.value, stderr, stdout),
        );
      }

      if (stderr.length > 0) {
        throw new Error(formatSandboxSyncError(undefined, stderr, stdout));
      }

      for (const download of downloads) {
        syncedAttachmentIds.add(download.attachmentId);
      }
    }

    return getUploadManifest().filter((attachment) =>
      requestedIds.has(attachment.attachmentId),
    );
  };

  const cleanup = async () => {
    if (!sandboxPromise) {
      return;
    }

    const sandbox = await sandboxPromise;
    await sandbox.kill();
  };

  return { getSandbox, getUploadManifest, syncUploadsToSandbox, cleanup };
}

function formatSandboxSyncError(
  exitValue: unknown,
  stderr: string,
  stdout: string,
) {
  const details = [stderr, stdout && `stdout: ${stdout}`]
    .filter(Boolean)
    .join("\n");

  return `Failed to sync uploaded files to sandbox: ${
    details || formatUnknownErrorValue(exitValue)
  }`;
}

function formatUnknownErrorValue(value: unknown) {
  if (value === undefined || value === null) {
    return "unknown error";
  }

  if (typeof value === "string") {
    return value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value.toString();
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "unknown error";
  }
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

function buildSandboxUploadCode(
  downloads: (SyncedAttachment & {
    contentBase64: string;
  })[],
) {
  const manifest = Buffer.from(JSON.stringify(downloads), "utf8").toString(
    "base64",
  );

  return `import base64
import json
import os

UPLOADS_DIR = ${JSON.stringify(SANDBOX_UPLOADS_DIR)}
MANIFEST = ${JSON.stringify(manifest)}

downloads = json.loads(base64.b64decode(MANIFEST).decode("utf-8"))
os.makedirs(UPLOADS_DIR, exist_ok=True)

for item in downloads:
    target_path = os.path.normpath(item["path"])
    if not target_path.startswith(UPLOADS_DIR + os.sep):
        raise RuntimeError(f"Unsafe upload target path for {item['fileName']!r}")

    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    with open(target_path, "wb") as output:
        output.write(base64.b64decode(item["contentBase64"]))
`;
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
