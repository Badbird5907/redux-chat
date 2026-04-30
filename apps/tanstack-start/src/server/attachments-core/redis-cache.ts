import { createHash } from "node:crypto";

import { redis } from "@redux/redis";

import type {
  AttachmentDerivativeRequest,
  ReadyPdfDerivative,
  ReadyTextDerivative,
} from "./types";
import {
  ATTACHMENT_DERIVATIVE_TTL_MS,
  ATTACHMENT_DERIVATIVE_VERSION,
} from "./policy";

interface CachedDerivativeBase {
  attachmentId: string;
  derivativeVersion: typeof ATTACHMENT_DERIVATIVE_VERSION;
  expiresAt: number;
  fileName: string;
  kind: AttachmentDerivativeRequest["kind"];
  mimeType: string;
  sourceSignature: string;
}

export interface CachedTextDerivative extends CachedDerivativeBase {
  charCount: number;
  kind: "normalized_text" | "pdf_text" | "spreadsheet_text";
}

export interface CachedTextChunks {
  chunks: string[];
}

export interface CachedPdfDerivative extends CachedDerivativeBase {
  accessKey: string;
  charCount?: number;
  environmentId: string;
  fileId?: string;
  fileKeyId: string;
  isPublic: boolean;
  kind: "converted_pdf";
  projectId: string;
  serveImage: boolean;
}

export type CachedDerivative = CachedTextDerivative | CachedPdfDerivative;

const DERIVATIVE_KINDS: AttachmentDerivativeRequest["kind"][] = [
  "converted_pdf",
  "normalized_text",
  "pdf_text",
  "spreadsheet_text",
];

function getRedis() {
  return redis();
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

function getDerivativeSignatureHash(sourceSignature: string) {
  return createHash("sha256")
    .update(sourceSignature)
    .digest("hex")
    .slice(0, 20);
}

function getDerivativeMetadataKey(request: AttachmentDerivativeRequest) {
  const sourceSignature = buildDerivativeSourceSignature(request);
  const hash = getDerivativeSignatureHash(sourceSignature);

  return `derivatives:${ATTACHMENT_DERIVATIVE_VERSION}:meta:${request.source.attachmentId}:${request.kind}:${hash}`;
}

function getDerivativeTextKey(request: AttachmentDerivativeRequest) {
  const sourceSignature = buildDerivativeSourceSignature(request);
  const hash = getDerivativeSignatureHash(sourceSignature);

  return `derivatives:${ATTACHMENT_DERIVATIVE_VERSION}:text:${request.source.attachmentId}:${request.kind}:${hash}`;
}

function getDerivativeKeyCandidates(source: AttachmentDerivativeRequest["source"]) {
  return DERIVATIVE_KINDS.flatMap((kind) => {
    const request = { source, kind } satisfies AttachmentDerivativeRequest;
    return [getDerivativeMetadataKey(request), getDerivativeTextKey(request)];
  });
}

function getDerivativeTtlSeconds() {
  return Math.ceil(ATTACHMENT_DERIVATIVE_TTL_MS / 1000);
}

function isCachedTextDerivative(value: unknown): value is CachedTextDerivative {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind !== "converted_pdf" &&
    "attachmentId" in value &&
    "fileName" in value &&
    "mimeType" in value &&
    "charCount" in value &&
    "expiresAt" in value &&
    "sourceSignature" in value
  );
}

function isCachedPdfDerivative(value: unknown): value is CachedPdfDerivative {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "converted_pdf" &&
    "attachmentId" in value &&
    "fileName" in value &&
    "mimeType" in value &&
    "accessKey" in value &&
    "fileKeyId" in value &&
    "projectId" in value &&
    "environmentId" in value &&
    "expiresAt" in value &&
    "sourceSignature" in value
  );
}

function isCachedTextChunks(value: unknown): value is CachedTextChunks {
  return (
    !!value &&
    typeof value === "object" &&
    "chunks" in value &&
    Array.isArray(value.chunks) &&
    value.chunks.every((chunk) => typeof chunk === "string")
  );
}

export async function getCachedDerivative(
  request: AttachmentDerivativeRequest,
): Promise<CachedDerivative | null> {
  const metadata = await getRedis().get<unknown>(
    getDerivativeMetadataKey(request),
  );
  if (request.kind === "converted_pdf") {
    return isCachedPdfDerivative(metadata) ? metadata : null;
  }

  return isCachedTextDerivative(metadata) ? metadata : null;
}

export async function getCachedPdfDerivativeRecords(
  source: AttachmentDerivativeRequest["source"],
) {
  const records = await Promise.all(
    DERIVATIVE_KINDS.map((kind) =>
      getCachedDerivative({ source, kind } satisfies AttachmentDerivativeRequest),
    ),
  );

  return records.filter((record) => record?.kind === "converted_pdf");
}

export async function deleteCachedAttachmentDerivatives(
  source: AttachmentDerivativeRequest["source"],
) {
  const keys = getDerivativeKeyCandidates(source);
  if (keys.length === 0) {
    return;
  }

  await getRedis().del(...keys);
}

export async function getCachedTextChunks(
  request: AttachmentDerivativeRequest,
) {
  const key = getDerivativeTextKey(request);
  console.log(`Getting text chunks for ${key}`);
  const chunks = await getRedis().get<unknown>(key);
  if (!isCachedTextChunks(chunks)) {
    return null;
  }

  return chunks.chunks;
}

export async function setCachedTextDerivative(
  request: AttachmentDerivativeRequest,
  derivative: Omit<
    CachedTextDerivative,
    "attachmentId" | "derivativeVersion" | "sourceSignature"
  >,
  chunks: string[],
) {
  const metadataKey = getDerivativeMetadataKey(request);
  const textKey = getDerivativeTextKey(request);
  const sourceSignature = buildDerivativeSourceSignature(request);
  const ttlSeconds = getDerivativeTtlSeconds();

  await Promise.all([
    getRedis().set(
      metadataKey,
      {
        ...derivative,
        attachmentId: request.source.attachmentId,
        derivativeVersion: ATTACHMENT_DERIVATIVE_VERSION,
        sourceSignature,
      } satisfies CachedTextDerivative,
      { ex: ttlSeconds },
    ),
    getRedis().set(textKey, { chunks } satisfies CachedTextChunks, {
      ex: ttlSeconds,
    }),
  ]);
}

export async function setCachedPdfDerivative(
  request: AttachmentDerivativeRequest,
  derivative: Omit<
    CachedPdfDerivative,
    "attachmentId" | "derivativeVersion" | "sourceSignature"
  >,
  textChunks?: string[],
) {
  const metadataKey = getDerivativeMetadataKey(request);
  const textKey = getDerivativeTextKey(request);
  const sourceSignature = buildDerivativeSourceSignature(request);
  const ttlSeconds = getDerivativeTtlSeconds();

  await Promise.all([
    getRedis().set(
      metadataKey,
      {
        ...derivative,
        attachmentId: request.source.attachmentId,
        derivativeVersion: ATTACHMENT_DERIVATIVE_VERSION,
        sourceSignature,
      } satisfies CachedPdfDerivative,
      { ex: ttlSeconds },
    ),
    ...(textChunks
      ? [
          getRedis().set(
            textKey,
            { chunks: textChunks } satisfies CachedTextChunks,
            {
              ex: ttlSeconds,
            },
          ),
        ]
      : []),
  ]);
}

export function hydrateCachedTextDerivative(input: {
  derivative: CachedTextDerivative;
  chunks: string[];
}): ReadyTextDerivative {
  return {
    kind: input.derivative.kind,
    charCount: input.derivative.charCount,
    textChunks: input.chunks,
  };
}

export function hydrateCachedPdfDerivative(input: {
  derivative: CachedPdfDerivative;
  url: string;
  textChunks?: string[];
}): ReadyPdfDerivative {
  return {
    kind: "converted_pdf",
    mimeType: "application/pdf",
    fileName: input.derivative.fileName,
    url: input.url,
    accessKey: input.derivative.accessKey,
    fileKeyId: input.derivative.fileKeyId,
    textChunks: input.textChunks,
    charCount: input.derivative.charCount,
  };
}
