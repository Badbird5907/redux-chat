import { nanoid } from "nanoid";
import { v } from "convex/values";

import { backendMutation, backendQuery } from "./index";

const attachmentDerivativeKind = v.union(
  v.literal("normalized_text"),
  v.literal("converted_pdf"),
  v.literal("pdf_text"),
  v.literal("spreadsheet_text"),
);

export const internal_getReadyByAttachmentIdAndKind = backendQuery({
  args: {
    attachmentId: v.string(),
    kind: attachmentDerivativeKind,
    version: v.string(),
    sourceSignature: v.string(),
  },
  handler: async (ctx, args) => {
    const derivatives = await ctx.db
      .query("attachmentDerivatives")
      .withIndex("by_attachmentId_kind", (q) =>
        q.eq("attachmentId", args.attachmentId).eq("kind", args.kind),
      )
      .collect();

    const derivative = derivatives.find(
      (entry) =>
        entry.version === args.version &&
        entry.sourceSignature === args.sourceSignature &&
        entry.status === "ready",
    );

    if (!derivative) {
      return null;
    }

    return {
      derivativeId: derivative.derivativeId,
      attachmentId: derivative.attachmentId,
      kind: derivative.kind,
      version: derivative.version,
      status: derivative.status,
      sourceSignature: derivative.sourceSignature,
      mimeType: derivative.mimeType,
      fileName: derivative.fileName,
      charCount: derivative.charCount,
      pageCount: derivative.pageCount,
      error: derivative.error,
      outputProjectId: derivative.outputProjectId,
      outputEnvironmentId: derivative.outputEnvironmentId,
      outputAccessKey: derivative.outputAccessKey,
      outputFileKeyId: derivative.outputFileKeyId,
      outputFileId: derivative.outputFileId,
      outputIsPublic: derivative.outputIsPublic,
      outputServeImage: derivative.outputServeImage,
      expiresAt: derivative.expiresAt,
    };
  },
});

export const internal_upsertProcessing = backendMutation({
  args: {
    attachmentId: v.string(),
    kind: attachmentDerivativeKind,
    version: v.string(),
    sourceSignature: v.string(),
    mimeType: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const derivatives = await ctx.db
      .query("attachmentDerivatives")
      .withIndex("by_attachmentId_kind", (q) =>
        q.eq("attachmentId", args.attachmentId).eq("kind", args.kind),
      )
      .collect();

    const now = Date.now();
    const existing = derivatives.find(
      (entry) =>
        entry.version === args.version &&
        entry.sourceSignature === args.sourceSignature,
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "processing",
        mimeType: args.mimeType,
        fileName: args.fileName,
        error: undefined,
        updatedAt: now,
      });

      return { derivativeId: existing.derivativeId };
    }

    const derivativeId = nanoid(22);
    await ctx.db.insert("attachmentDerivatives", {
      derivativeId,
      attachmentId: args.attachmentId,
      kind: args.kind,
      version: args.version,
      status: "processing",
      sourceSignature: args.sourceSignature,
      mimeType: args.mimeType,
      fileName: args.fileName,
      createdAt: now,
      updatedAt: now,
    });

    return { derivativeId };
  },
});

export const internal_markReadyText = backendMutation({
  args: {
    derivativeId: v.string(),
    mimeType: v.string(),
    fileName: v.string(),
    charCount: v.number(),
    pageCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("attachmentDerivatives")
      .withIndex("by_derivativeId", (q) => q.eq("derivativeId", args.derivativeId))
      .first();

    if (!match) {
      return { success: false };
    }

    await ctx.db.patch(match._id, {
      status: "ready",
      mimeType: args.mimeType,
      fileName: args.fileName,
      charCount: args.charCount,
      pageCount: args.pageCount,
      error: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const internal_markReadyPdf = backendMutation({
  args: {
    derivativeId: v.string(),
    mimeType: v.string(),
    fileName: v.string(),
    pageCount: v.optional(v.number()),
    charCount: v.optional(v.number()),
    outputProjectId: v.string(),
    outputEnvironmentId: v.string(),
    outputAccessKey: v.string(),
    outputFileKeyId: v.string(),
    outputFileId: v.optional(v.string()),
    outputIsPublic: v.boolean(),
    outputServeImage: v.boolean(),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("attachmentDerivatives")
      .withIndex("by_derivativeId", (q) => q.eq("derivativeId", args.derivativeId))
      .first();

    if (!match) {
      return { success: false };
    }

    await ctx.db.patch(match._id, {
      status: "ready",
      mimeType: args.mimeType,
      fileName: args.fileName,
      pageCount: args.pageCount,
      charCount: args.charCount,
      outputProjectId: args.outputProjectId,
      outputEnvironmentId: args.outputEnvironmentId,
      outputAccessKey: args.outputAccessKey,
      outputFileKeyId: args.outputFileKeyId,
      outputFileId: args.outputFileId,
      outputIsPublic: args.outputIsPublic,
      outputServeImage: args.outputServeImage,
      expiresAt: args.expiresAt,
      error: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const internal_markFailed = backendMutation({
  args: {
    derivativeId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("attachmentDerivatives")
      .withIndex("by_derivativeId", (q) => q.eq("derivativeId", args.derivativeId))
      .first();

    if (!match) {
      return { success: false };
    }

    await ctx.db.patch(match._id, {
      status: "failed",
      error: args.error,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const internal_listTextChunks = backendQuery({
  args: { derivativeId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("attachmentDerivativeTextChunks")
      .withIndex("by_derivativeId_chunkIndex", (q) =>
        q.eq("derivativeId", args.derivativeId),
      )
      .collect();

    return rows.map((row) => ({
      derivativeId: row.derivativeId,
      chunkIndex: row.chunkIndex,
      text: row.text,
    }));
  },
});

export const internal_replaceTextChunks = backendMutation({
  args: {
    derivativeId: v.string(),
    chunks: v.array(
      v.object({
        chunkIndex: v.number(),
        text: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("attachmentDerivativeTextChunks")
      .withIndex("by_derivativeId", (q) => q.eq("derivativeId", args.derivativeId))
      .collect();

    for (const row of existing) {
      await ctx.db.delete(row._id);
    }

    const now = Date.now();
    for (const chunk of args.chunks) {
      await ctx.db.insert("attachmentDerivativeTextChunks", {
        derivativeId: args.derivativeId,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        createdAt: now,
      });
    }

    return { count: args.chunks.length };
  },
});
