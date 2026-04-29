import type { VectorStore } from "./vector-store";
import { ConvexVectorStore } from "./convex-vector-store";

/**
 * The single swap point for migrating to a different vector backend.
 * Today: Convex. Tomorrow: change this one line to Pinecone / Turbopuffer / etc.
 */
export function getVectorStore(): VectorStore {
  return new ConvexVectorStore();
}

export type {
  EmbeddedChunk,
  EmbeddingModality,
  RetrievedChunk,
  VectorStore,
} from "./vector-store";
