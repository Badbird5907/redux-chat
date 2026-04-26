import type { GenericMutationCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { DataModel } from "../_generated/dataModel";
import { backendMutation, mutation, query } from "./index";

type AttachmentMutationCtx = GenericMutationCtx<DataModel> & {
  userId: string;
};

export async function attachDraftAttachmentsToMessage(
  ctx: AttachmentMutationCtx,
  args: {
    attachmentIds: string[];
    threadId: string;
    messageId: string;
  },
) {
  for (const attachmentId of args.attachmentIds) {
    const attachment = await ctx.db
      .query("attachments")
      .withIndex("by_attachmentId", (q) => q.eq("attachmentId", attachmentId))
      .first();

    if (!attachment || attachment.userId !== ctx.userId) {
      throw new ConvexError("Attachment not found");
    }

    if (attachment.status !== "draft") {
      throw new ConvexError("Attachment is no longer in draft state");
    }

    await ctx.db.patch(attachment._id, {
      status: "attached",
      threadId: args.threadId,
      messageId: args.messageId,
      updatedAt: Date.now(),
    });
  }
}

export const internal_createUploadedAttachment = backendMutation({
  args: {
    secret: v.string(),
    attachmentId: v.string(),
    userId: v.string(),
    threadId: v.optional(v.string()),
    projectId: v.string(),
    environmentId: v.string(),
    accessKey: v.string(),
    fileKeyId: v.string(),
    fileId: v.optional(v.string()),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    isPublic: v.boolean(),
    serveImage: v.boolean(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_attachmentId", (q) => q.eq("attachmentId", args.attachmentId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        threadId: args.threadId,
        projectId: args.projectId,
        environmentId: args.environmentId,
        accessKey: args.accessKey,
        fileKeyId: args.fileKeyId,
        fileId: args.fileId,
        fileName: args.fileName,
        mimeType: args.mimeType,
        size: args.size,
        isPublic: args.isPublic,
        serveImage: args.serveImage,
        expiresAt: args.expiresAt,
        updatedAt: now,
      });
      return { attachmentId: existing.attachmentId };
    }

    await ctx.db.insert("attachments", {
      attachmentId: args.attachmentId,
      userId: args.userId,
      threadId: args.threadId,
      status: "draft",
      projectId: args.projectId,
      environmentId: args.environmentId,
      accessKey: args.accessKey,
      fileKeyId: args.fileKeyId,
      fileId: args.fileId,
      fileName: args.fileName,
      mimeType: args.mimeType,
      size: args.size,
      isPublic: args.isPublic,
      serveImage: args.serveImage,
      expiresAt: args.expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return { attachmentId: args.attachmentId };
  },
});

export const listByIds = query({
  args: { attachmentIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const attachments = await Promise.all(
      args.attachmentIds.map(async (attachmentId) => {
        const attachment = await ctx.db
          .query("attachments")
          .withIndex("by_attachmentId", (q) => q.eq("attachmentId", attachmentId))
          .first();

        if (!attachment || attachment.userId !== ctx.userId) {
          return null;
        }

        return {
          attachmentId: attachment.attachmentId,
          threadId: attachment.threadId,
          messageId: attachment.messageId,
          status: attachment.status,
          projectId: attachment.projectId,
          environmentId: attachment.environmentId,
          accessKey: attachment.accessKey,
          fileKeyId: attachment.fileKeyId,
          fileId: attachment.fileId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          isPublic: attachment.isPublic,
          serveImage: attachment.serveImage,
          expiresAt: attachment.expiresAt,
        };
      }),
    );

    return attachments.filter((attachment) => attachment !== null);
  },
});

export const deleteDraftAttachment = mutation({
  args: { attachmentId: v.string() },
  handler: async (ctx, args) => {
    const attachment = await ctx.db
      .query("attachments")
      .withIndex("by_attachmentId", (q) => q.eq("attachmentId", args.attachmentId))
      .first();

    if (!attachment || attachment.userId !== ctx.userId) {
      throw new ConvexError("Attachment not found");
    }

    if (attachment.status !== "draft") {
      throw new ConvexError("Attached files cannot be deleted from a draft");
    }

    await ctx.db.delete(attachment._id);
    return { success: true };
  },
});

export const attachToMessage = mutation({
  args: {
    attachmentIds: v.array(v.string()),
    threadId: v.string(),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    await attachDraftAttachmentsToMessage(ctx, args);
    return { success: true };
  },
});
