import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import {
  buildAttachmentUrl,
  getInternalConvexClient,
} from "@/lib/silo/core.server";

import type {
  AttachmentDerivativeRequest,
  ReadyAttachmentDerivative,
  ReadyPdfDerivative,
  ReadyTextDerivative,
} from "./types";

export const ATTACHMENT_DERIVATIVE_VERSION = "v1";

interface ReadyDerivativeRecord {
  derivativeId: string;
  kind: AttachmentDerivativeRequest["kind"];
  mimeType: string;
  fileName: string;
  charCount?: number;
  outputAccessKey?: string;
  outputFileKeyId?: string;
  outputIsPublic?: boolean;
  outputServeImage?: boolean;
}

function getClient() {
  return getInternalConvexClient();
}

export function buildDerivativeSourceSignature(
  request: AttachmentDerivativeRequest,
) {
  const { source } = request;
  return [
    request.kind,
    ATTACHMENT_DERIVATIVE_VERSION,
    source.attachmentId,
    source.fileName,
    source.mimeType,
    String(source.size),
  ].join(":");
}

export async function getReadyDerivativeRecord(
  request: AttachmentDerivativeRequest,
) {
  return getClient().query(
    api.functions.attachmentDerivatives.internal_getReadyByAttachmentIdAndKind,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      attachmentId: request.source.attachmentId,
      kind: request.kind,
      version: ATTACHMENT_DERIVATIVE_VERSION,
      sourceSignature: buildDerivativeSourceSignature(request),
    },
  );
}

export async function beginDerivativeProcessing(
  request: AttachmentDerivativeRequest,
  output: { mimeType: string; fileName: string },
) {
  return getClient().mutation(
    api.functions.attachmentDerivatives.internal_upsertProcessing,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      attachmentId: request.source.attachmentId,
      kind: request.kind,
      version: ATTACHMENT_DERIVATIVE_VERSION,
      sourceSignature: buildDerivativeSourceSignature(request),
      mimeType: output.mimeType,
      fileName: output.fileName,
    },
  );
}

export async function replaceDerivativeTextChunks(
  derivativeId: string,
  textChunks: string[],
) {
  return getClient().mutation(
    api.functions.attachmentDerivatives.internal_replaceTextChunks,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      derivativeId,
      chunks: textChunks.map((text, chunkIndex) => ({ chunkIndex, text })),
    },
  );
}

export async function listDerivativeTextChunks(derivativeId: string) {
  const chunks = await getClient().query(
    api.functions.attachmentDerivatives.internal_listTextChunks,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      derivativeId,
    },
  );

  return chunks
    .sort((left, right) => left.chunkIndex - right.chunkIndex)
    .map((chunk) => chunk.text);
}

export async function markTextDerivativeReady(input: {
  derivativeId: string;
  mimeType: string;
  fileName: string;
  charCount: number;
  pageCount?: number;
}) {
  return getClient().mutation(
    api.functions.attachmentDerivatives.internal_markReadyText,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      ...input,
    },
  );
}

export async function markPdfDerivativeReady(input: {
  derivativeId: string;
  mimeType: string;
  fileName: string;
  pageCount?: number;
  charCount?: number;
  outputProjectId: string;
  outputEnvironmentId: string;
  outputAccessKey: string;
  outputFileKeyId: string;
  outputFileId?: string;
  outputIsPublic: boolean;
  outputServeImage: boolean;
  expiresAt?: number;
}) {
  return getClient().mutation(
    api.functions.attachmentDerivatives.internal_markReadyPdf,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      ...input,
    },
  );
}

export async function markDerivativeFailed(
  derivativeId: string,
  error: string,
) {
  return getClient().mutation(
    api.functions.attachmentDerivatives.internal_markFailed,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      derivativeId,
      error,
    },
  );
}

export async function hydrateReadyDerivative(
  derivative: ReadyDerivativeRecord,
): Promise<ReadyAttachmentDerivative> {
  if (derivative.kind === "converted_pdf") {
    if (!derivative.outputAccessKey || !derivative.outputFileKeyId) {
      throw new Error("Converted PDF derivative is missing file metadata");
    }

    const pdfUrl = await buildAttachmentUrl({
      accessKey: derivative.outputAccessKey,
      fileName: derivative.fileName,
      mimeType: derivative.mimeType,
      isPublic: derivative.outputIsPublic ?? false,
      serveImage: derivative.outputServeImage ?? false,
    });

    const readyPdf: ReadyPdfDerivative = {
      kind: "converted_pdf",
      mimeType: "application/pdf",
      fileName: derivative.fileName,
      url: pdfUrl,
      accessKey: derivative.outputAccessKey,
      fileKeyId: derivative.outputFileKeyId,
    };

    return readyPdf;
  }

  const readyText: ReadyTextDerivative = {
    kind: derivative.kind,
    textChunks: await listDerivativeTextChunks(derivative.derivativeId),
    charCount: derivative.charCount ?? 0,
  };

  return readyText;
}
