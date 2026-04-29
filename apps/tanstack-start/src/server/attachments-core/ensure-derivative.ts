import { buildAttachmentUrl } from "@/lib/silo/core.server";

import {
  beginDerivativeProcessing,
  getReadyDerivativeRecord,
  hydrateReadyDerivative,
  markDerivativeFailed,
  markPdfDerivativeReady,
  markTextDerivativeReady,
  replaceDerivativeTextChunks,
} from "./cache";
import { convertAttachmentToPdf } from "./convert-pdf";
import { downloadAttachmentSource } from "./download";
import { extractTextDerivative } from "./extract-text";
import type { AttachmentDerivativeRequest, ReadyAttachmentDerivative } from "./types";

export async function ensureAttachmentDerivative(
  request: AttachmentDerivativeRequest,
): Promise<ReadyAttachmentDerivative> {
  const cached = await getReadyDerivativeRecord(request);
  if (cached) {
    return hydrateReadyDerivative(cached);
  }

  const processing = await beginDerivativeProcessing(request, {
    mimeType:
      request.kind === "converted_pdf" ? "application/pdf" : "text/plain",
    fileName:
      request.kind === "converted_pdf"
        ? request.source.fileName.replace(/\.[^.]+$/, ".pdf")
        : `${request.source.fileName}.txt`,
  });

  try {
    const downloaded = await downloadAttachmentSource(request.source);

    if (request.kind === "converted_pdf") {
      const pdf = await convertAttachmentToPdf({ // TODO: write a server wrapping libreoffice that just takes in a URL instead of bytes
        source: request.source,
        bytes: downloaded.bytes,
      });

      await markPdfDerivativeReady({
        derivativeId: processing.derivativeId,
        mimeType: pdf.mimeType,
        fileName: pdf.fileName,
        outputProjectId: request.source.projectId,
        outputEnvironmentId: request.source.environmentId,
        outputAccessKey: pdf.accessKey,
        outputFileKeyId: pdf.fileKeyId,
        outputFileId: pdf.fileId,
        outputIsPublic: false,
        outputServeImage: false,
        expiresAt: pdf.expiresAt,
      });

      const url = await buildAttachmentUrl({
        accessKey: pdf.accessKey,
        fileName: pdf.fileName,
        mimeType: pdf.mimeType,
        isPublic: false,
        serveImage: false,
      });

      return {
        kind: "converted_pdf",
        mimeType: "application/pdf",
        fileName: pdf.fileName,
        url,
        accessKey: pdf.accessKey,
        fileKeyId: pdf.fileKeyId,
      };
    }

    const textDerivative = await extractTextDerivative({
      source: request.source,
      kind: request.kind,
      bytes: downloaded.bytes,
    });

    await replaceDerivativeTextChunks(
      processing.derivativeId,
      textDerivative.textChunks,
    );
    await markTextDerivativeReady({
      derivativeId: processing.derivativeId,
      mimeType: textDerivative.mimeType,
      fileName: textDerivative.fileName,
      charCount: textDerivative.charCount,
    });

    return {
      kind: textDerivative.kind,
      textChunks: textDerivative.textChunks,
      charCount: textDerivative.charCount,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown derivative error";
    await markDerivativeFailed(processing.derivativeId, message.slice(0, 1000));
    throw new Error(`Failed to process ${request.source.fileName}: ${message}`);
  }
}
