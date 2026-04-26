import { ConvexHttpClient } from "convex/browser";
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";

export function getSiloCore() {
  return createSiloCoreFromToken({
    url: env.SILO_URL,
    token: env.SILO_TOKEN,
    cdnHost: env.SILO_CDN,
  });
}

export function getInternalConvexClient() {
  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  return client;
}

export async function buildAttachmentUrl(input: {
  accessKey: string;
  fileName: string;
  mimeType: string;
  isPublic: boolean;
  serveImage: boolean;
}) {
  const siloCore = getSiloCore();

  if (input.serveImage && input.mimeType.startsWith("image/")) {
    return siloCore.generateImageUrl({
      accessKey: input.accessKey,
      fileName: input.fileName,
      isPublic: input.isPublic,
      serveImage: input.serveImage,
    });
  }

  return siloCore.generateDownloadUrl({
    accessKey: input.accessKey,
    fileName: input.fileName,
    isPublic: input.isPublic,
  });
}

export async function createUploadedAttachmentRecord(input: {
  attachmentId: string;
  userId: string;
  threadId?: string;
  projectId: string;
  environmentId: string;
  accessKey: string;
  fileKeyId: string;
  fileId?: string;
  fileName: string;
  mimeType: string;
  size: number;
  isPublic: boolean;
  serveImage: boolean;
  expiresAt: number;
}) {
  const client = getInternalConvexClient();
  return client.mutation(api.functions.attachments.internal_createUploadedAttachment, {
    secret: env.INTERNAL_CONVEX_SECRET,
    ...input,
  });
}
