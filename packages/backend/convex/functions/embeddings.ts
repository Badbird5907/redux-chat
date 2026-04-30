import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { DataModel } from "../_generated/dataModel";
import { api } from "../_generated/api";
import { backendEnv } from "../env";
import { backendAction, backendMutation, backendQuery } from "./index";

const embeddingModality = v.union(
  v.literal("text"),
  v.literal("image"),
  v.literal("pdf_page"),
);

const embeddingStatus = v.union(
  v.literal("queued"),
  v.literal("indexing"),
  v.literal("indexed"),
  v.literal("failed"),
);

const chunkValidator = v.object({
  embeddingId: v.string(),
  chunkIndex: v.number(),
  modality: embeddingModality,
  pageNumber: v.optional(v.number()),
  text: v.optional(v.string()),
  embedding: v.array(v.float64()),
  embeddingModel: v.string(),
  embeddingDims: v.number(),
});

type BackendDbCtx = GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>;

async function getProjectAttachmentForOwner(
  ctx: BackendDbCtx,
  args: {
    userId: string;
    attachmentId: string;
    chatProjectId?: string;
  },
) {
  const attachment = await ctx.db
    .query("attachments")
    .withIndex("by_attachmentId", (q) =>
      q.eq("attachmentId", args.attachmentId),
    )
    .first();

  if (
    attachment?.userId !== args.userId ||
    !attachment.chatProjectId ||
    (args.chatProjectId !== undefined &&
      attachment.chatProjectId !== args.chatProjectId)
  ) {
    throw new ConvexError("Attachment not found");
  }

  return attachment;
}

/**
 * Inserts (or replaces) the embedding rows for a single attachment. We use
 * a delete-then-insert strategy so re-indexing is fully idempotent regardless
 * of how the chunk count changed.
 */
export const internal_upsertEmbeddings = backendMutation({
  args: {
    userId: v.string(),
    attachmentId: v.string(),
    chatProjectId: v.string(),
    chunks: v.array(chunkValidator),
  },
  handler: async (ctx, args) => {
    await getProjectAttachmentForOwner(ctx, {
      userId: args.userId,
      attachmentId: args.attachmentId,
      chatProjectId: args.chatProjectId,
    });

    // Delete any existing embeddings for this attachment
    const existing = await ctx.db
      .query("attachmentEmbeddings")
      .withIndex("by_attachmentId", (q) =>
        q.eq("attachmentId", args.attachmentId),
      )
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    for (const chunk of args.chunks) {
      await ctx.db.insert("attachmentEmbeddings", {
        embeddingId: chunk.embeddingId,
        attachmentId: args.attachmentId,
        chatProjectId: args.chatProjectId,
        userId: args.userId,
        chunkIndex: chunk.chunkIndex,
        modality: chunk.modality,
        pageNumber: chunk.pageNumber,
        text: chunk.text,
        embedding: chunk.embedding,
        embeddingModel: chunk.embeddingModel,
        embeddingDims: chunk.embeddingDims,
        createdAt: now,
      });
    }

    return { count: args.chunks.length };
  },
});

export const internal_deleteEmbeddingsForAttachment = backendMutation({
  args: { userId: v.string(), attachmentId: v.string() },
  handler: async (ctx, args) => {
    await getProjectAttachmentForOwner(ctx, {
      userId: args.userId,
      attachmentId: args.attachmentId,
    });

    const rows = await ctx.db
      .query("attachmentEmbeddings")
      .withIndex("by_attachmentId", (q) =>
        q.eq("attachmentId", args.attachmentId),
      )
      .collect();

    for (const row of rows) {
      await ctx.db.delete(row._id);
    }

    return { deleted: rows.length };
  },
});

export const internal_setAttachmentEmbeddingStatus = backendMutation({
  args: {
    userId: v.string(),
    attachmentId: v.string(),
    status: embeddingStatus,
    error: v.optional(v.string()),
    chunkCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const attachment = await getProjectAttachmentForOwner(ctx, {
      userId: args.userId,
      attachmentId: args.attachmentId,
    });

    await ctx.db.patch(attachment._id, {
      embeddingStatus: args.status,
      embeddingError: args.error,
      embeddingChunkCount: args.chunkCount,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Hydrates a list of embedding rows by their internal _id. Used by the search
 * action after it gets vector hits (which only return ids + scores). Internal-only
 * so it skips userId checks here — those are enforced in the calling action.
 */
export const internal_getEmbeddingsByIds = backendQuery({
  args: { ids: v.array(v.id("attachmentEmbeddings")) },
  handler: async (ctx, args) => {
    const rows = await Promise.all(args.ids.map((id) => ctx.db.get(id)));
    return rows
      .filter((row): row is NonNullable<typeof row> => row !== null)
      .map((row) => ({
        _id: row._id,
        embeddingId: row.embeddingId,
        attachmentId: row.attachmentId,
        chatProjectId: row.chatProjectId,
        userId: row.userId,
        chunkIndex: row.chunkIndex,
        modality: row.modality,
        pageNumber: row.pageNumber,
        text: row.text,
      }));
  },
});

/**
 * Looks up the file metadata (name, mime, etc.) for a set of attachmentIds.
 * Used by the search action to enrich retrieved chunks with their file's name
 * for citation rendering.
 */
export const internal_getAttachmentSummaries = backendQuery({
  args: { userId: v.string(), attachmentIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out: Record<
      string,
      {
        fileName: string;
        mimeType: string;
        accessKey: string;
        isPublic: boolean;
        serveImage: boolean;
      }
    > = {};

    for (const attachmentId of args.attachmentIds) {
      const a = await ctx.db
        .query("attachments")
        .withIndex("by_attachmentId", (q) => q.eq("attachmentId", attachmentId))
        .first();
      if (a?.userId !== args.userId) continue;
      out[attachmentId] = {
        fileName: a.fileName,
        mimeType: a.mimeType,
        accessKey: a.accessKey,
        isPublic: a.isPublic,
        serveImage: a.serveImage,
      };
    }

    return out;
  },
});

export interface SearchHit {
  embeddingId: string;
  attachmentId: string;
  fileName: string;
  mimeType: string;
  chunkIndex: number;
  modality: "text" | "image" | "pdf_page";
  pageNumber?: number;
  text?: string;
  score: number;
}

/**
 * Vector-search wrapper. Convex requires `vectorSearch` to be invoked from an
 * action (not a query/mutation), and only returns `_id` + `_score` — we then
 * batch-load the rows + their attachment metadata.
 */
export const internal_searchEmbeddings = backendAction({
  args: {
    userId: v.string(),
    chatProjectId: v.string(),
    vector: v.array(v.float64()),
    k: v.number(),
  },
  handler: async (ctx, args): Promise<SearchHit[]> => {
    const env = backendEnv();
    const results = await ctx.vectorSearch(
      "attachmentEmbeddings",
      "by_embedding",
      {
        vector: args.vector,
        limit: args.k,
        filter: (q) => q.eq("chatProjectId", args.chatProjectId),
      },
    );

    if (results.length === 0) return [];

    const rows = await ctx.runQuery(
      api.functions.embeddings.internal_getEmbeddingsByIds,
      { secret: env.INTERNAL_CONVEX_SECRET, ids: results.map((r) => r._id) },
    );

    // Filter by ownership (defense-in-depth — the chatProjectId filter already
    // restricts but we double-check the userId on each row).
    const ownedRows = rows.filter((r) => r.userId === args.userId);
    if (ownedRows.length === 0) return [];

    const attachmentIds = Array.from(
      new Set(ownedRows.map((r) => r.attachmentId)),
    );
    const summaries = await ctx.runQuery(
      api.functions.embeddings.internal_getAttachmentSummaries,
      {
        secret: env.INTERNAL_CONVEX_SECRET,
        userId: args.userId,
        attachmentIds,
      },
    );

    // Score lookup keyed by _id
    const scoreById = new Map(results.map((r) => [r._id, r._score]));

    return ownedRows
      .map((row): SearchHit | null => {
        const summary = summaries[row.attachmentId];
        if (!summary) return null;
        const score = scoreById.get(row._id) ?? 0;
        return {
          embeddingId: row.embeddingId,
          attachmentId: row.attachmentId,
          fileName: summary.fileName,
          mimeType: summary.mimeType,
          chunkIndex: row.chunkIndex,
          modality: row.modality,
          pageNumber: row.pageNumber,
          text: row.text,
          score,
        };
      })
      .filter((h): h is SearchHit => h !== null)
      .sort((a, b) => b.score - a.score);
  },
});
