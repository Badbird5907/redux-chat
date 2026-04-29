import {
  getReadyDerivativeRecord,
  hydrateReadyDerivative,
  storeReadyPdfDerivative,
  storeReadyTextDerivative,
} from "./cache";
import { convertAttachmentToPdf } from "./convert-pdf";
import { downloadAttachmentSource } from "./download";
import { extractTextDerivative } from "./extract-text";
import { ATTACHMENT_DERIVATIVE_TTL_MS } from "./policy";
import type { AttachmentDerivativeRequest, ReadyAttachmentDerivative } from "./types";

export async function ensureAttachmentDerivative(
  request: AttachmentDerivativeRequest,
): Promise<ReadyAttachmentDerivative> {
  const cached = await getReadyDerivativeRecord(request);
  if (cached) {
    try {
      return await hydrateReadyDerivative(request, cached);
    } catch {
      // stale/malformed cache entry, regenerate below
    }
  }

  try {
    const downloaded = await downloadAttachmentSource(request.source);
    const expiresAt = Date.now() + ATTACHMENT_DERIVATIVE_TTL_MS;

    if (request.kind === "converted_pdf") {
      const pdf = await convertAttachmentToPdf({
        source: request.source,
        bytes: downloaded.bytes,
        expiresAt,
      });

    await storeReadyPdfDerivative(request, {
      accessKey: pdf.accessKey,
      environmentId: request.source.environmentId,
      expiresAt: pdf.expiresAt,
      fileId: pdf.fileId,
      fileKeyId: pdf.fileKeyId,
      fileName: pdf.fileName,
      isPublic: false,
      kind: "converted_pdf",
      mimeType: pdf.mimeType,
      projectId: request.source.projectId,
      serveImage: false,
      });

      return {
        kind: "converted_pdf",
        mimeType: "application/pdf",
        fileName: pdf.fileName,
        url: pdf.url,
        accessKey: pdf.accessKey,
        fileKeyId: pdf.fileKeyId,
      };
    }

    const textDerivative = await extractTextDerivative({
      source: request.source,
      kind: request.kind,
      bytes: downloaded.bytes,
    });

    await storeReadyTextDerivative(request, {
      charCount: textDerivative.charCount,
      expiresAt,
      fileName: textDerivative.fileName,
      kind: textDerivative.kind,
      mimeType: "text/plain",
      textChunks: textDerivative.textChunks,
    });

    return {
      kind: textDerivative.kind,
      textChunks: textDerivative.textChunks,
      charCount: textDerivative.charCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown derivative error";
    throw new Error(`Failed to process ${request.source.fileName}: ${message}`);
  }
}
