import type { GenericMutationCtx } from "convex/server";
import { createSiloCoreFromToken } from "@silo-storage/sdk-core";
import { ConvexError, v } from "convex/values";

import type { DataModel, Doc } from "../_generated/dataModel";
// eslint-disable-next-line no-restricted-imports
import type { QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { backendEnv } from "../env";
import { backendMutation, mutation, query } from "./index";
import { internalAction, internalMutation } from "./internal";

type AttachmentMutationCtx = GenericMutationCtx<DataModel> & {
  userId: string;
};

type UsableConvertedPdfDerivative = Doc<"attachmentDerivatives"> & {
  outputAccessKey: string;
  outputEnvironmentId: string;
  outputFileKeyId: string;
};

const ATTACHED_ATTACHMENT_TTL_DAYS = 60;
const ATTACHED_ATTACHMENT_TTL_MS =
  ATTACHED_ATTACHMENT_TTL_DAYS * 24 * 60 * 60 * 1000;

function createBackendSiloCore() {
  const env = backendEnv();
  return createSiloCoreFromToken({
    url: env.SILO_URL,
    token: env.SILO_TOKEN,
    cdnHost: env.SILO_CDN,
  });
}

function isAttachmentExpired(expiresAt: number | undefined, now = Date.now()) {
  return expiresAt !== undefined && expiresAt <= now;
}

function combinedExpiry(
  attachmentExpiresAt: number | undefined,
  derivativeExpiresAt: number | undefined,
): number | undefined {
  if (attachmentExpiresAt === undefined) {
    return derivativeExpiresAt;
  }
  if (derivativeExpiresAt === undefined) {
    return attachmentExpiresAt;
  }
  return Math.min(attachmentExpiresAt, derivativeExpiresAt);
}

function isUsableConvertedPdfDerivative(
  derivative: Doc<"attachmentDerivatives">,
  now: number,
): derivative is UsableConvertedPdfDerivative {
  return (
    derivative.status === "ready" &&
    derivative.outputAccessKey !== undefined &&
    derivative.outputEnvironmentId !== undefined &&
    derivative.outputFileKeyId !== undefined &&
    (derivative.expiresAt === undefined || derivative.expiresAt > now)
  );
}

async function newestUsableConvertedPdfDerivative(
  ctx: QueryCtx,
  attachmentId: string,
  now: number,
) {
  const derivatives = await ctx.db
    .query("attachmentDerivatives")
    .withIndex("by_attachmentId_kind", (q) =>
      q.eq("attachmentId", attachmentId).eq("kind", "converted_pdf"),
    )
    .collect();

  const ready = derivatives.filter((derivative) =>
    isUsableConvertedPdfDerivative(derivative, now),
  );

  if (ready.length === 0) {
    return null;
  }

  ready.sort((a, b) => b.updatedAt - a.updatedAt);
  return ready[0] ?? null;
}

export async function mergedAttachmentServingRow(
  ctx: QueryCtx,
  attachment: Doc<"attachments">,
  now: number,
) {
  const pdf = await newestUsableConvertedPdfDerivative(
    ctx,
    attachment.attachmentId,
    now,
  );

  const blendedExpiresAt = pdf
    ? combinedExpiry(attachment.expiresAt, pdf.expiresAt)
    : attachment.expiresAt;

  const expired = isAttachmentExpired(blendedExpiresAt, now);

  if (pdf) {
    return {
      attachmentId: attachment.attachmentId,
      threadId: attachment.threadId,
      messageId: attachment.messageId,
      status: attachment.status,
      projectId: attachment.projectId,
      environmentId: pdf.outputEnvironmentId,
      accessKey: pdf.outputAccessKey,
      fileKeyId: pdf.outputFileKeyId,
      fileId: pdf.outputFileId,
      fileName: pdf.fileName,
      originalFileName: attachment.fileName,
      mimeType: pdf.mimeType,
      size: attachment.size,
      isPublic: pdf.outputIsPublic ?? attachment.isPublic,
      serveImage: pdf.outputServeImage ?? attachment.serveImage,
      expiresAt: blendedExpiresAt,
      expired,
    };
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
    expired,
  };
}

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

    if (attachment?.userId !== ctx.userId) {
      throw new ConvexError("Attachment not found");
    }

    if (isAttachmentExpired(attachment.expiresAt)) {
      throw new ConvexError("Attachment has expired");
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

    await ctx.scheduler.runAfter(
      0,
      internal.functions.attachments.internal_extendAttachedAttachmentExpiry,
      {
        attachmentId: attachment.attachmentId,
        projectId: attachment.projectId,
        environmentId: attachment.environmentId,
        fileKeyId: attachment.fileKeyId,
        expiresAt: Date.now() + ATTACHED_ATTACHMENT_TTL_MS,
      },
    );
  }
}

export const internal_createUploadedAttachment = backendMutation({
  args: {
    secret: v.string(),
    attachmentId: v.string(),
    userId: v.string(),
    threadId: v.optional(v.string()),
    chatProjectId: v.optional(v.string()),
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
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Project files are uploaded directly into a project's library — they
    // never expire and skip the draft -> attached lifecycle.
    const isProjectFile = args.chatProjectId !== undefined;
    const status: "draft" | "attached" = isProjectFile ? "attached" : "draft";
    const expiresAt = isProjectFile ? undefined : args.expiresAt;

    const existing = await ctx.db
      .query("attachments")
      .withIndex("by_attachmentId", (q) =>
        q.eq("attachmentId", args.attachmentId),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        threadId: args.threadId,
        chatProjectId: args.chatProjectId,
        status,
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
        expiresAt,
        updatedAt: now,
      });
      return { attachmentId: existing.attachmentId };
    }

    await ctx.db.insert("attachments", {
      attachmentId: args.attachmentId,
      userId: args.userId,
      threadId: args.threadId,
      chatProjectId: args.chatProjectId,
      status,
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
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    return { attachmentId: args.attachmentId };
  },
});

export const listByIds = query({
  args: { attachmentIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const attachments = await Promise.all(
      args.attachmentIds.map(async (attachmentId) => {
        const attachment = await ctx.db
          .query("attachments")
          .withIndex("by_attachmentId", (q) =>
            q.eq("attachmentId", attachmentId),
          )
          .first();

        if (attachment?.userId !== ctx.userId) {
          return null;
        }

        return mergedAttachmentServingRow(ctx, attachment, now);
      }),
    );

    return attachments.filter((attachment) => attachment !== null);
  },
});

export const internal_syncAttachmentExpiry = internalMutation({
  args: {
    attachmentId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const attachment = await ctx.db
      .query("attachments")
      .withIndex("by_attachmentId", (q) =>
        q.eq("attachmentId", args.attachmentId),
      )
      .first();

    if (!attachment) {
      return;
    }

    await ctx.db.patch(attachment._id, {
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
  },
});

export const internal_extendAttachedAttachmentExpiry = internalAction({
  args: {
    attachmentId: v.string(),
    projectId: v.string(),
    environmentId: v.string(),
    fileKeyId: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const siloCore = createBackendSiloCore();

    await siloCore.updateFileExpiry({
      projectId: args.projectId,
      environmentId: args.environmentId,
      fileKeyId: args.fileKeyId,
      expiresAt: new Date(args.expiresAt),
    });

    await ctx.runMutation(
      internal.functions.attachments.internal_syncAttachmentExpiry,
      {
        attachmentId: args.attachmentId,
        expiresAt: args.expiresAt,
      },
    );
  },
});

export const internal_deleteFileFromSilo = internalAction({
  args: {
    projectId: v.string(),
    environmentId: v.string(),
    fileKeyId: v.string(),
    accessKey: v.string(),
  },
  handler: async (_ctx, args) => {
    const siloCore = createBackendSiloCore();

    await siloCore.deleteFile({
      projectId: args.projectId,
      environmentId: args.environmentId,
      fileKeyId: args.fileKeyId,
      accessKey: args.accessKey,
    });

    return { success: true };
  },
});

export const deleteDraftAttachment = mutation({
  args: { attachmentId: v.string() },
  handler: async (ctx, args) => {
    const attachment = await ctx.db
      .query("attachments")
      .withIndex("by_attachmentId", (q) =>
        q.eq("attachmentId", args.attachmentId),
      )
      .first();

    if (attachment?.userId !== ctx.userId) {
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
