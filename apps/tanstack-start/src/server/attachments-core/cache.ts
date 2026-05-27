import type {
  AttachmentDerivativeRequest,
  ReadyAttachmentDerivative,
} from "./types";
import { buildAttachmentUrl } from "@/lib/silo/core.server";
import {
  deleteCachedAttachmentDerivatives,
  getCachedDerivative,
  getCachedPdfDerivativeRecords,
  getCachedTextChunks,
  hydrateCachedPdfDerivative,
  hydrateCachedTextDerivative,
  setCachedPdfDerivative,
  setCachedTextDerivative,
} from "./redis-cache";

function isExpired(expiresAt: number) {
  return expiresAt <= Date.now();
}

export async function getReadyDerivativeRecord(
  request: AttachmentDerivativeRequest,
) {
  const derivative = await getCachedDerivative(request);
  if (!derivative || isExpired(derivative.expiresAt)) {
    return null;
  }

  return derivative;
}

export async function getReadyPdfDerivativeRecords(
  source: AttachmentDerivativeRequest["source"],
) {
  const derivatives = await getCachedPdfDerivativeRecords(source);
  return derivatives.filter((derivative) => !isExpired(derivative.expiresAt));
}

export async function deleteAttachmentDerivativeCache(
  source: AttachmentDerivativeRequest["source"],
) {
  await deleteCachedAttachmentDerivatives(source);
}

export async function hydrateReadyDerivative(
  request: AttachmentDerivativeRequest,
  derivative: Awaited<ReturnType<typeof getReadyDerivativeRecord>>,
): Promise<ReadyAttachmentDerivative> {
  if (!derivative) {
    throw new Error("Cannot hydrate an empty derivative record");
  }

  if (derivative.kind === "converted_pdf") {
    const pdfUrl = await buildAttachmentUrl({
      accessKey: derivative.accessKey,
      fileName: derivative.fileName,
      mimeType: derivative.mimeType,
      isPublic: derivative.isPublic,
      serveImage: derivative.serveImage,
    });
    const textChunks =
      derivative.charCount !== undefined
        ? await getCachedTextChunks(request)
        : undefined;

    return hydrateCachedPdfDerivative({
      derivative,
      url: pdfUrl,
      textChunks: textChunks ?? undefined,
    });
  }

  const textChunks = await getCachedTextChunks(request);
  if (!textChunks) {
    throw new Error("Cached text derivative is missing text chunks");
  }

  return hydrateCachedTextDerivative({
    derivative,
    chunks: textChunks,
  });
}

export async function storeReadyTextDerivative(
  request: AttachmentDerivativeRequest,
  derivative: {
    charCount: number;
    expiresAt: number;
    fileName: string;
    kind: "normalized_text" | "pdf_text" | "spreadsheet_text";
    mimeType: "text/plain";
    textChunks: string[];
  },
) {
  await setCachedTextDerivative(
    request,
    {
      charCount: derivative.charCount,
      expiresAt: derivative.expiresAt,
      fileName: derivative.fileName,
      kind: derivative.kind,
      mimeType: derivative.mimeType,
    },
    derivative.textChunks,
  );
}

export async function storeReadyPdfDerivative(
  request: AttachmentDerivativeRequest,
  derivative: {
    accessKey: string;
    environmentId: string;
    expiresAt: number;
    fileId?: string;
    fileKeyId: string;
    fileName: string;
    isPublic: boolean;
    kind: "converted_pdf";
    mimeType: "application/pdf";
    projectId: string;
    serveImage: boolean;
  },
) {
  await setCachedPdfDerivative(request, derivative);
}

export async function storeReadyPdfDerivativeText(
  request: AttachmentDerivativeRequest,
  derivative: {
    charCount: number;
    textChunks: string[];
  },
) {
  const cached = await getReadyDerivativeRecord(request);
  if (cached?.kind !== "converted_pdf") {
    return;
  }

  await setCachedPdfDerivative(
    request,
    {
      accessKey: cached.accessKey,
      charCount: derivative.charCount,
      environmentId: cached.environmentId,
      expiresAt: cached.expiresAt,
      fileId: cached.fileId,
      fileKeyId: cached.fileKeyId,
      fileName: cached.fileName,
      isPublic: cached.isPublic,
      kind: "converted_pdf",
      mimeType: "application/pdf",
      projectId: cached.projectId,
      serveImage: cached.serveImage,
    },
    derivative.textChunks,
  );
}
