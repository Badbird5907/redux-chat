import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { getInternalConvexClient } from "@/lib/silo/core.server";

import type {
  EmbeddedChunk,
  RetrievedChunk,
  VectorStore,
} from "./vector-store";

/**
 * Convex implementation of VectorStore. Talks to the
 * `packages/backend/convex/functions/embeddings.ts` adapter.
 *
 * To swap to another vector backend (Pinecone / Turbopuffer / pgvector / ...),
 * write a sibling implementation of `VectorStore` and change the line in
 * `./index.ts` that constructs this class. The rest of the RAG code stays the
 * same.
 */
export class ConvexVectorStore implements VectorStore {
  async upsert(input: {
    userId: string;
    attachmentId: string;
    chatProjectId: string;
    chunks: EmbeddedChunk[];
  }): Promise<void> {
    const client = getInternalConvexClient();
    await client.mutation(
      api.functions.embeddings.internal_upsertEmbeddings,
      {
        secret: env.INTERNAL_CONVEX_SECRET,
        userId: input.userId,
        attachmentId: input.attachmentId,
        chatProjectId: input.chatProjectId,
        chunks: input.chunks.map((chunk) => ({
          embeddingId: chunk.embeddingId,
          chunkIndex: chunk.chunkIndex,
          modality: chunk.modality,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
          embedding: chunk.embedding,
          embeddingModel: chunk.embeddingModel,
          embeddingDims: chunk.embeddingDims,
        })),
      },
    );
  }

  async search(input: {
    userId: string;
    chatProjectId: string;
    vector: number[];
    k: number;
  }): Promise<RetrievedChunk[]> {
    const client = getInternalConvexClient();
    const hits = await client.action(
      api.functions.embeddings.internal_searchEmbeddings,
      {
        secret: env.INTERNAL_CONVEX_SECRET,
        userId: input.userId,
        chatProjectId: input.chatProjectId,
        vector: input.vector,
        k: input.k,
      },
    );

    return hits.map((hit) => ({
      embeddingId: hit.embeddingId,
      attachmentId: hit.attachmentId,
      fileName: hit.fileName,
      mimeType: hit.mimeType,
      chunkIndex: hit.chunkIndex,
      modality: hit.modality,
      pageNumber: hit.pageNumber,
      text: hit.text,
      score: hit.score,
    }));
  }

  async deleteForAttachment(attachmentId: string): Promise<void> {
    const client = getInternalConvexClient();
    await client.mutation(
      api.functions.embeddings.internal_deleteEmbeddingsForAttachment,
      {
        secret: env.INTERNAL_CONVEX_SECRET,
        attachmentId,
      },
    );
  }
}
