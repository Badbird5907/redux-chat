import type { InMemoryFs } from "just-bash";

import { uploadToSilo } from "@/server/ai/model-generated-files";

const UPLOADS_PREFIX = "/uploads";
const MAX_SERIALIZED_BYTES = 5 * 1024 * 1024; // 5 MB
const FS_STATE_FILENAME = "bash-fs-state.json";
const FS_STATE_MIME = "application/json";

export interface BashFsStateRef {
  accessKey: string;
  fileKeyId: string;
}

interface SerializedFs {
  version: 1;
  files: Record<string, string>;
}

/**
 * Serialize all user-created files from the in-memory FS into a JSON blob.
 * Skips the `/uploads` directory (those are re-synced from attachments each
 * turn) and any directories.
 */
export async function serializeBashFs(
  fs: InMemoryFs,
): Promise<{ bytes: Uint8Array; fileCount: number } | null> {
  const allPaths = fs.getAllPaths();

  // Filter to real files outside /uploads
  const filePaths: string[] = [];
  for (const p of allPaths) {
    if (p === "/" || p.startsWith(UPLOADS_PREFIX)) continue;
    try {
      const st = await fs.stat(p);
      if (st.isFile) filePaths.push(p);
    } catch {
      // stat failed → skip
    }
  }

  if (filePaths.length === 0) return null;

  // Read all files in parallel
  const entries = await Promise.all(
    filePaths.map(async (p) => {
      try {
        const content = await fs.readFile(p);
        return [p, content] as const;
      } catch {
        return null;
      }
    }),
  );

  const files: Record<string, string> = {};
  for (const entry of entries) {
    if (entry) files[entry[0]] = entry[1];
  }

  const fileCount = Object.keys(files).length;
  if (fileCount === 0) return null;

  const payload: SerializedFs = { version: 1, files };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);

  if (bytes.byteLength > MAX_SERIALIZED_BYTES) {
    console.warn(
      `[bash-fs] Serialized FS exceeds ${MAX_SERIALIZED_BYTES} bytes (${bytes.byteLength}), skipping persistence`,
    );
    return null;
  }

  return { bytes, fileCount };
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
 */
export async function downloadBashFsState(
  ref: BashFsStateRef,
): Promise<Record<string, string> | null> {
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
    const payload = (await res.json()) as Record<string, unknown>;
    if (
      payload.version !== 1 ||
      typeof payload.files !== "object" ||
      payload.files === null
    )
      return null;
    return payload.files as Record<string, string>;
  } catch {
    console.warn("[bash-fs] Failed to parse FS state JSON");
    return null;
  }
}
