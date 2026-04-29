import { tool } from "ai";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import {
  formatProjectKnowledgeChunk,
} from "@/lib/ai/tools/project-knowledge-format";
import {
  buildAttachmentUrl,
  getInternalConvexClient,
} from "@/lib/silo/core.server";
import {
  selectProjectMediaAttachmentIds,
  toProjectToolModelOutputPart,
} from "@/lib/ai/tools/project-knowledge-media";
import { retrieveProjectContextForUser } from "@/server/rag/retrieve";

async function resolveAttachmentUrls(attachmentIds: string[]) {
  if (attachmentIds.length === 0) {
    return new Map<
      string,
      { url: string; mimeType: string; fileName: string }
    >();
  }

  const client = getInternalConvexClient();
  const summaries = await client.query(
    api.functions.embeddings.internal_getAttachmentSummaries,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      attachmentIds,
    },
  );

  const entries = await Promise.all(
    attachmentIds.map(async (attachmentId) => {
      const summary = summaries[attachmentId];
      if (!summary) {
        return undefined;
      }

      const url = await buildAttachmentUrl({
        accessKey: summary.accessKey,
        fileName: summary.fileName,
        mimeType: summary.mimeType,
        isPublic: summary.isPublic,
        serveImage: summary.serveImage,
      });

      return [
        attachmentId,
        {
          url,
          mimeType: summary.mimeType,
          fileName: summary.fileName,
        },
      ] as const;
    }),
  );

  return new Map(entries.filter((entry) => entry !== undefined));
}

type SearchProjectToolContext = {
  userId: string;
  chatProjectId: string;
  modelId: string;
};

export const searchProjectKnowledgeTool = (projectContext: SearchProjectToolContext) => {
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
    toModelOutput: async ({ output }) => {
      const content: (| { type: "text"; text: string }
        | { type: "file-url"; url: string }
        | { type: "image-url"; url: string })[] = [];

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!output || typeof output !== "object" || !("results" in output)) {
        return {
          type: "content" as const,
          value: [{ type: "text" as const, text: "Project search completed." }],
        };
      }

      const results = Array.isArray(output.results) ? output.results : [];
      if (results.length === 0) {
        return {
          type: "content" as const,
          value: [
            {
              type: "text" as const,
              text: "No relevant results were found in the project knowledge base.",
            },
          ],
        };
      }

      content.push({
        type: "text",
        text: results
          .map((result, index) => {
            return formatProjectKnowledgeChunk(result, {
              tag: `[#kb-${index + 1}]`,
              emptyText: "(no extracted text)",
            });
          })
          .join("\n\n"),
      });

      const rawAttachmentIds = selectProjectMediaAttachmentIds(
        results.flatMap((result) =>
          typeof result.attachmentId === "string" &&
          typeof result.mimeType === "string"
            ? [{
                attachmentId: result.attachmentId,
                mimeType: result.mimeType,
                text: result.text,
              }]
            : [],
        ),
        projectContext.modelId,
      );

      const attachmentUrls = await resolveAttachmentUrls(rawAttachmentIds);

      for (const attachmentId of rawAttachmentIds) {
        const attachment = attachmentUrls.get(attachmentId);
        if (!attachment) {
          continue;
        }

        content.push(toProjectToolModelOutputPart(attachment));
      }

      return {
        type: "content" as const,
        value: content,
      };
    },
  });
};
