import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import type { InMemoryFs } from "just-bash";

import { uploadToSilo } from "@/server/ai/model-generated-files";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const UPLOADS_PREFIX = "/uploads";
const EXCLUDED_PREFIXES = ["/dev/", "/bin/", "/usr/", "/proc/"];
const MAX_PRE_COMPRESSION_BYTES = 5 * 1024 * 1024; // 5 MB
const FS_STATE_FILENAME = "bash-fs-state.json";
const FS_STATE_MIME = "application/gzip";

export interface BashFsStateRef {
  accessKey: string;
  fileKeyId: string;
}

interface SerializedFsV1 {
  version: 1;
  files: Record<string, string>;
}

interface SerializedFsV2 {
  version: 2;
  files: Record<string, string | { b64: string }>;
}

type SerializedFs = SerializedFsV1 | SerializedFsV2;

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

function isExcludedPath(path: string): boolean {
  return EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/**
 * Serialize all user-created files from the in-memory FS into a
 * gzip-compressed JSON blob (v2 format).
 *
 * Skips system directories (`/dev`, `/bin`, `/usr`, `/proc`), the `/uploads`
 * directory (re-synced from attachments each turn), and any directories.
 * Binary file contents are base64-encoded for safe JSON transport.
 */
export async function serializeBashFs(
  fs: InMemoryFs,
): Promise<{ bytes: Uint8Array; fileCount: number } | null> {
  const allPaths = fs.getAllPaths();

  const filePaths: string[] = [];
  for (const p of allPaths) {
    if (p === "/" || p === UPLOADS_PREFIX || p.startsWith(`${UPLOADS_PREFIX}/`))
      continue;
    if (isExcludedPath(p)) continue;
    try {
      const st = await fs.stat(p);
      if (st.isFile) filePaths.push(p);
    } catch {
      // stat failed → skip
    }
  }

  if (filePaths.length === 0) return null;

  const entries = await Promise.all(
    filePaths.map(async (p) => {
      try {
        const buffer = await fs.readFileBuffer(p);
        let value: string | { b64: string };
        try {
          value = utf8Decoder.decode(buffer);
        } catch {
          value = { b64: Buffer.from(buffer).toString("base64") };
        }
        return [p, value] as const;
      } catch {
        return null;
      }
    }),
  );

  const files: Record<string, string | { b64: string }> = {};
  for (const entry of entries) {
    if (entry) files[entry[0]] = entry[1];
  }

  const fileCount = Object.keys(files).length;
  if (fileCount === 0) return null;

  const payload: SerializedFsV2 = { version: 2, files };
  const json = JSON.stringify(payload);
  const jsonBytes = new TextEncoder().encode(json);

  if (jsonBytes.byteLength > MAX_PRE_COMPRESSION_BYTES) {
    console.warn(
      `[bash-fs] Serialized FS exceeds ${MAX_PRE_COMPRESSION_BYTES} bytes (${jsonBytes.byteLength}), skipping persistence`,
    );
    return null;
  }

  const compressed = await gzipAsync(jsonBytes);
  return { bytes: new Uint8Array(compressed), fileCount };
}

/**
 * Upload serialized FS state to Silo and return the storage reference.
 */
export async function uploadBashFsState(
  bytes: Uint8Array,
  metadata: { threadId: string; userId: string; fileCount: number },
): Promise<BashFsStateRef> {
  const storage = await uploadToSilo({
    bytes,
    fileName: FS_STATE_FILENAME,
    mimeType: FS_STATE_MIME,
    metadata: {
      purpose: "bash-fs-state",
      threadId: metadata.threadId,
      userId: metadata.userId,
      fileCount: metadata.fileCount,
      savedAt: Date.now(),
    },
  });

  return {
    accessKey: storage.accessKey,
    fileKeyId: storage.fileKeyId,
  };
}

/**
 * Download previously-persisted FS state from Silo and return the file map
 * suitable for passing as `initialFiles` to the InMemoryFs constructor.
 * Handles both legacy uncompressed v1 and gzip-compressed v2 formats.
 */
export async function downloadBashFsState(
  ref: BashFsStateRef,
): Promise<Record<string, string | Uint8Array> | null> {
  const { buildAttachmentDownloadUrl } = await import("@/lib/silo/core.server");
  const url = await buildAttachmentDownloadUrl({
    accessKey: ref.accessKey,
    fileKeyId: ref.fileKeyId,
    fileName: FS_STATE_FILENAME,
    isPublic: true,
  });

  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`[bash-fs] Failed to download FS state: ${res.status}`);
    return null;
  }

  try {
    const rawBytes = new Uint8Array(await res.arrayBuffer());

    let jsonBytes: Uint8Array;
    if (rawBytes.length >= 2 && rawBytes[0] === 0x1f && rawBytes[1] === 0x8b) {
      jsonBytes = new Uint8Array(await gunzipAsync(rawBytes));
    } else {
      jsonBytes = rawBytes;
    }

    const jsonStr = new TextDecoder().decode(jsonBytes);
    const payload = JSON.parse(jsonStr) as SerializedFs;

    if (payload.version === 2) {
      const result: Record<string, string | Uint8Array> = {};
      for (const [path, value] of Object.entries(payload.files)) {
        if (typeof value === "string") {
          result[path] = value;
        } else {
          result[path] = Buffer.from(value.b64, "base64");
        }
      }
      return result;
    }

    // v1 fallback: all strings, filter out system paths on read
    const result: Record<string, string> = {};
    for (const [path, value] of Object.entries(payload.files)) {
      if (!isExcludedPath(path)) {
        result[path] = value;
      }
    }
    return result;
  } catch {
    console.warn("[bash-fs] Failed to parse FS state");
    return null;
  }
}
