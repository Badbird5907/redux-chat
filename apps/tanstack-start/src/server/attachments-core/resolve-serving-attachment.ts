import type { AttachmentDerivativeRequest, AttachmentSourceRef } from "./types";
import { getReadyDerivativeRecord } from "./cache";

export interface SourceAttachmentRow extends AttachmentSourceRef {
  expired?: boolean;
  expiresAt?: number;
  fileId?: string;
  fileKeyId: string;
  messageId?: string;
  status: string;
  threadId?: string;
}

export interface ServingAttachmentRow extends SourceAttachmentRow {
  expired: boolean;
  originalFileName?: string;
}

function isExpired(expiresAt: number | undefined, now: number) {
  return expiresAt !== undefined && expiresAt <= now;
}

function combinedExpiry(
  sourceExpiresAt: number | undefined,
  derivativeExpiresAt: number,
) {
  if (sourceExpiresAt === undefined) {
    return derivativeExpiresAt;
  }

  return Math.min(sourceExpiresAt, derivativeExpiresAt);
}

function toConvertedPdfDerivativeRequest(
  attachment: SourceAttachmentRow,
): AttachmentDerivativeRequest {
  return {
    kind: "converted_pdf",
    source: {
      accessKey: attachment.accessKey,
      attachmentId: attachment.attachmentId,
      environmentId: attachment.environmentId,
      fileName: attachment.fileName,
      isPublic: attachment.isPublic,
      mimeType: attachment.mimeType,
      projectId: attachment.projectId,
      serveImage: attachment.serveImage,
      size: attachment.size,
    },
  };
}

export async function resolveServingAttachment(
  attachment: SourceAttachmentRow,
  now = Date.now(),
): Promise<ServingAttachmentRow> {
  const sourceExpired = isExpired(attachment.expiresAt, now);
  if (sourceExpired) {
    return {
      ...attachment,
      expired: true,
    };
  }

  const derivative = await getReadyDerivativeRecord(
    toConvertedPdfDerivativeRequest(attachment),
  );
  if (derivative?.kind !== "converted_pdf") {
    return {
      ...attachment,
      expired: false,
    };
  }

  const expiresAt = combinedExpiry(attachment.expiresAt, derivative.expiresAt);

  return {
    ...attachment,
    accessKey: derivative.accessKey,
    environmentId: derivative.environmentId,
    expired: isExpired(expiresAt, now),
    expiresAt,
    fileId: derivative.fileId,
    fileKeyId: derivative.fileKeyId,
    fileName: derivative.fileName,
    isPublic: derivative.isPublic,
    mimeType: derivative.mimeType,
    originalFileName: attachment.fileName,
    projectId: derivative.projectId,
    serveImage: derivative.serveImage,
  };
}
