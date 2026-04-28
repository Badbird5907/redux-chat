/**
 * VectorStore is the single seam between RAG application code (extraction,
 * embedding, retrieval) and whatever vector backend stores the embeddings.
 *
 * Today's implementation talks to Convex (`ConvexVectorStore`). To migrate to
 * Pinecone / pgvector / Turbopuffer / etc., write a new implementation of this
 * interface and change one line in `./index.ts`.
 */

export type EmbeddingModality = "text" | "image" | "pdf_page";

export interface EmbeddedChunk {
  embeddingId: string;
  chunkIndex: number;
  modality: EmbeddingModality;
  pageNumber?: number;
  /** Optional text body — used for citation rendering and as fallback context. */
  text?: string;
  embedding: number[];
  embeddingModel: string;
  embeddingDims: number;
}

export interface RetrievedChunk {
  embeddingId: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  chunkIndex: number;
  modality: EmbeddingModality;
  pageNumber?: number;
  text?: string;
  score: number;
}

export interface VectorStore {
  upsert(input: {
    userId: string;
    attachmentId: string;
    chatProjectId: string;
    chunks: EmbeddedChunk[];
  }): Promise<void>;

  search(input: {
    userId: string;
    chatProjectId: string;
    vector: number[];
    k: number;
  }): Promise<RetrievedChunk[]>;

  deleteForAttachment(attachmentId: string): Promise<void>;
}
