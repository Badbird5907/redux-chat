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

      const downloads = options.attachments.map((attachment) => {
        const path = buildSandboxFilePath(attachment.fileName, pathCounts);

        return {
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          path,
          url: attachment.url,
        };
      });

      const result = await sandbox.runCode(buildSandboxDownloadCode(downloads), {
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

      return downloads.map(
        ({ attachmentId, fileName, mimeType, path }): SyncedAttachment => ({
          attachmentId,
          fileName,
          mimeType,
          path,
        }),
      );
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

function buildSandboxDownloadCode(downloads: (SyncedAttachment & {
  url: string;
})[]) {
  const manifest = Buffer.from(JSON.stringify(downloads), "utf8").toString(
    "base64",
  );

  return `import base64
import json
import os
import shutil
import tempfile
import urllib.error
import urllib.request

UPLOADS_DIR = ${JSON.stringify(SANDBOX_UPLOADS_DIR)}
MANIFEST = ${JSON.stringify(manifest)}

downloads = json.loads(base64.b64decode(MANIFEST).decode("utf-8"))
os.makedirs(UPLOADS_DIR, exist_ok=True)

for item in downloads:
    temp_path = None
    target_path = os.path.normpath(item["path"])
    if not target_path.startswith(UPLOADS_DIR + os.sep):
        raise RuntimeError(f"Unsafe upload target path for {item['fileName']!r}")

    os.makedirs(os.path.dirname(target_path), exist_ok=True)

    try:
        request = urllib.request.Request(
            item["url"],
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; ReduxChatSandbox/1.0)",
                "Accept": "*/*",
            },
        )
        with urllib.request.urlopen(request, timeout=60) as response:
            status = getattr(response, "status", 200)
            if status < 200 or status >= 300:
                raise RuntimeError(f"HTTP {status}")

            with tempfile.NamedTemporaryFile(
                dir=os.path.dirname(target_path),
                delete=False,
            ) as tmp:
                temp_path = tmp.name
                shutil.copyfileobj(response, tmp)

        os.replace(temp_path, target_path)
    except urllib.error.HTTPError as exc:
        if temp_path is not None and os.path.exists(temp_path):
            os.unlink(temp_path)
        body = exc.read(1000).decode("utf-8", errors="replace").strip()
        details = f"HTTP {exc.code}"
        if body:
            details = f"{details}: {body}"
        raise RuntimeError(
            f"Failed to download uploaded file {item['fileName']!r}: {details}"
        ) from exc
    except Exception as exc:
        if temp_path is not None and os.path.exists(temp_path):
            os.unlink(temp_path)
        raise RuntimeError(
            f"Failed to download uploaded file {item['fileName']!r}: {exc}"
        ) from exc
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
