import { Sandbox } from "@e2b/code-interpreter";

export const SANDBOX_UPLOADS_DIR = "/uploads";

export interface ChatToolAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  getDownloadUrl: () => Promise<string>;
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
            url: await source.getDownloadUrl(),
          };
        }),
    );

    if (downloads.length > 0) {
      const sandbox = await getSandbox();
      const result = await sandbox.runCode(buildSandboxUploadCode(downloads), {
        language: "bash",
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

  const readFileBytes = async (path: string): Promise<Uint8Array> => {
    const sandbox = await getSandbox();
    return sandbox.files.read(path, { format: "bytes" });
  };

  const cleanup = async () => {
    if (!sandboxPromise) {
      return;
    }

    const sandbox = await sandboxPromise;
    await sandbox.kill();
  };

  return {
    getSandbox,
    getUploadManifest,
    syncUploadsToSandbox,
    readFileBytes,
    cleanup,
  };
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
    url: string;
  })[],
) {
  const uploadsDir = shellQuote(SANDBOX_UPLOADS_DIR);
  const lines = [
    "set -euo pipefail",
    // SANDBOX_UPLOADS_DIR lives at the filesystem root, which the sandbox user
    // cannot create without elevated permissions; fall back to sudo and make it
    // user-writable so the per-file downloads below run unprivileged.
    `mkdir -p ${uploadsDir} 2>/dev/null || sudo mkdir -p ${uploadsDir}`,
    `[ -w ${uploadsDir} ] || sudo chown -R "$(id -un)":"$(id -gn)" ${uploadsDir}`,
  ];

  for (const download of downloads) {
    if (!isSafeSandboxUploadPath(download.path)) {
      throw new Error(`Unsafe upload target path for ${download.fileName}`);
    }

    lines.push(
      `mkdir -p ${shellQuote(getPosixDirName(download.path))}`,
      [
        "curl",
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--retry",
        "2",
        "--connect-timeout",
        "15",
        "--max-time",
        "60",
        "--output",
        shellQuote(download.path),
        shellQuote(download.url),
      ].join(" "),
    );
  }

  return `${lines.join("\n")}\n`;
}

function isSafeSandboxUploadPath(path: string) {
  return (
    path === SANDBOX_UPLOADS_DIR || path.startsWith(`${SANDBOX_UPLOADS_DIR}/`)
  );
}

function getPosixDirName(path: string) {
  const slashIndex = path.lastIndexOf("/");
  return slashIndex > 0 ? path.slice(0, slashIndex) : ".";
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
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
