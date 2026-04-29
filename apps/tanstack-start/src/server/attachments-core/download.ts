import { buildAttachmentUrl } from "@/lib/silo/core.server";

import type { AttachmentSourceRef } from "./types";

export interface DownloadedAttachmentSource {
  source: AttachmentSourceRef;
  downloadUrl: string;
  bytes: ArrayBuffer;
}

export async function downloadAttachmentSource(
  source: AttachmentSourceRef,
): Promise<DownloadedAttachmentSource> {
  const downloadUrl = await buildAttachmentUrl({
    accessKey: source.accessKey,
    fileName: source.fileName,
    mimeType: source.mimeType,
    isPublic: source.isPublic,
    serveImage: source.serveImage,
  });

  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to download attachment: ${response.status} ${response.statusText}`,
    );
  }

  return {
    source,
    downloadUrl,
    bytes: await response.arrayBuffer(),
  };
}
