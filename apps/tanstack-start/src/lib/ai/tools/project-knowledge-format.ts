import type { EmbeddingModality } from "@/server/rag/vector-store";

export interface ProjectKnowledgeChunkLike {
  fileName: string;
  modality: EmbeddingModality;
  pageNumber?: number;
  text?: string;
}

export function formatProjectKnowledgeChunk(
  chunk: ProjectKnowledgeChunkLike,
  options: {
    tag: string;
    includeFilePrefix?: boolean;
    emptyText: string;
    imageText?: string;
  },
) {
  const filePrefix = options.includeFilePrefix ? "file: " : "";
  const locator =
    chunk.modality === "pdf_page" && typeof chunk.pageNumber === "number"
      ? `${filePrefix}${chunk.fileName}, page ${chunk.pageNumber}`
      : `${filePrefix}${chunk.fileName}`;

  const excerpt =
    chunk.modality === "image" && options.imageText
      ? options.imageText
      : chunk.text?.trim()
        ? chunk.text.trim()
        : options.emptyText;

  return `${options.tag} ${locator}\n${excerpt}`;
}
