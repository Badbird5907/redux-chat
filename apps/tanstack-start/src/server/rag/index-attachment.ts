import { api } from "@redux/backend/convex/_generated/api";

import type { EmbedItem, EmbedPart } from "./embed-client";
import type { EmbeddedChunk } from "./vector-store";
import { env } from "@/env";
import {
  buildAttachmentUrl,
  getInternalConvexClient,
} from "@/lib/silo/core.server";
import { EMBEDDING_DIMS, EMBEDDING_MODEL, embedItems } from "./embed-client";
import { extractChunks } from "./extract";
import { getVectorStore } from "./index";

export interface IndexProjectFileInput {
  attachmentId: string;
  userId: string;
  chatProjectId: string;
  fileName: string;
  mimeType: string;
  accessKey: string;
  isPublic: boolean;
  serveImage: boolean;
}

function generateEmbeddingId() {
  // Same scheme used elsewhere — 22-char crypto-random id.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
}

async function setStatus(input: {
  userId: string;
  attachmentId: string;
  status: "queued" | "indexing" | "indexed" | "failed";
  error?: string;
  chunkCount?: number;
}) {
  const client = getInternalConvexClient();
  await client.mutation(
    api.functions.embeddings.internal_setAttachmentEmbeddingStatus,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      userId: input.userId,
      attachmentId: input.attachmentId,
      status: input.status,
      error: input.error,
      chunkCount: input.chunkCount,
    },
  );
}

/**
 * The full extract → embed → upsert pipeline for a single project file.
 *
 * Designed to be called fire-and-forget from `upload.ts.onUploadComplete`.
 * Updates `attachments.embeddingStatus` so the UI can show progress.
 *
 * Throwing here means the file's status flips to "failed" with the error
 * message recorded — the user can retry via a UI affordance.
 */
export async function embedAndIndexProjectFile(input: IndexProjectFileInput) {
  await setStatus({
    userId: input.userId,
    attachmentId: input.attachmentId,
    status: "indexing",
  });

  try {
    const downloadUrl = await buildAttachmentUrl({
      accessKey: input.accessKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      isPublic: input.isPublic,
      serveImage: input.serveImage,
    });
    console.log("downloadUrl", downloadUrl);

    const response = await fetch(downloadUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch file from Silo: ${response.status} ${response.statusText}`,
      );
    }
    const bytes = await response.arrayBuffer();

    const extracted = await extractChunks({
      mimeType: input.mimeType,
      fileName: input.fileName,
      bytes,
      downloadUrl,
    });

    if (extracted.length === 0) {
      await setStatus({
        userId: input.userId,
        attachmentId: input.attachmentId,
        status: "indexed",
        chunkCount: 0,
      });
      return;
    }

    // Build one EmbedItem per chunk. Text chunks embed as text; image / PDF
    // chunks embed as native inline media. PDF chunks may still carry `text`
    // for downstream prompt context, but we intentionally do not include that
    // text in the embedding request to avoid duplicating the PDF content and
    // inflating Gemini token usage.
    //
    // Chunks that produced neither text nor inlineData (shouldn't happen,
    // but guard anyway) are filtered out so we don't send empty `parts`.
    const embedTargets: {
      chunk: (typeof extracted)[number];
      item: EmbedItem;
    }[] = [];
    for (const chunk of extracted) {
      const parts: EmbedPart[] = [];
      if (chunk.text && !chunk.inlineData) parts.push({ text: chunk.text });
      if (chunk.inlineData) parts.push({ inlineData: chunk.inlineData });
      if (parts.length === 0) continue;
      embedTargets.push({ chunk, item: { parts } });
    }

    const vectors = await embedItems(embedTargets.map((t) => t.item));

    const embedded: EmbeddedChunk[] = [];
    embedTargets.forEach(({ chunk }, i) => {
      const vector = vectors[i];
      if (!vector) return;
      embedded.push({
        embeddingId: generateEmbeddingId(),
        chunkIndex: chunk.chunkIndex,
        modality: chunk.modality,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        embedding: vector,
        embeddingModel: EMBEDDING_MODEL,
        embeddingDims: EMBEDDING_DIMS,
      });
    });

    if (embedded.length === 0) {
      await setStatus({
        userId: input.userId,
        attachmentId: input.attachmentId,
        status: "indexed",
        chunkCount: 0,
      });
      return;
    }

    await getVectorStore().upsert({
      userId: input.userId,
      attachmentId: input.attachmentId,
      chatProjectId: input.chatProjectId,
      chunks: embedded,
    });

    await setStatus({
      userId: input.userId,
      attachmentId: input.attachmentId,
      status: "indexed",
      chunkCount: embedded.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown indexing error";
    console.error(
      `[rag/index-attachment] Failed to index ${input.attachmentId}:`,
      error,
    );
    try {
      await setStatus({
        userId: input.userId,
        attachmentId: input.attachmentId,
        status: "failed",
        error: message.slice(0, 1000),
      });
    } catch (statusError) {
      console.error(
        `[rag/index-attachment] Failed to mark status=failed for ${input.attachmentId}:`,
        statusError,
      );
    }
    throw error;
  }
}
