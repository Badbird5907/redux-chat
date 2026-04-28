import { tool } from "ai";
import { z } from "zod";

import { retrieveProjectContextForUser } from "@/server/rag/retrieve";

export const searchProjectKnowledgeTool = (projectContext: { userId: string, chatProjectId: string }) => {
  return tool({
    description: [
      "Search the current project's indexed file library for relevant context.",
      "Use this when the answer may be in the project's uploaded files or when you need better evidence than the current context window provides.",
      "Return results include file names, optional page numbers, excerpts, and similarity scores.",
    ].join(" "),
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(500)
        .describe("A focused semantic search query for the current project."),
      k: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum number of chunks to return. Defaults to 6."),
    }),
    execute: async ({ query, k }) => {
      const { chunks } = await retrieveProjectContextForUser({
        userId: projectContext.userId,
        chatProjectId: projectContext.chatProjectId,
        query,
        k,
      });

      return {
        chatProjectId: projectContext.chatProjectId,
        query,
        results: chunks.map((chunk) => ({
          attachmentId: chunk.attachmentId,
          embeddingId: chunk.embeddingId,
          fileName: chunk.fileName,
          mimeType: chunk.mimeType,
          chunkIndex: chunk.chunkIndex,
          modality: chunk.modality,
          pageNumber: chunk.pageNumber,
          text: chunk.text,
          score: chunk.score,
        })),
      };
    },
  });
};