import type { GenericMutationCtx } from "convex/server";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { DataModel } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { mutation, query } from "./index";

function generateProjectId() {
  // 22-char crypto-random id (similar entropy to nanoid)
  return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
}

function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) {
    return undefined;
  }
  if (value.length === 0) {
    return undefined;
  }
  return value;
}

async function deleteAttachmentEmbeddings(
  ctx: GenericMutationCtx<DataModel>,
  attachmentId: string,
) {
  const rows = await ctx.db
    .query("attachmentEmbeddings")
    .withIndex("by_attachmentId", (q) => q.eq("attachmentId", attachmentId))
    .collect();

  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

export const createProject = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim().slice(0, 120);
    if (!name) {
      throw new ConvexError("Project name cannot be empty");
    }

    const projectId = generateProjectId();
    const now = Date.now();

    await ctx.db.insert("projects", {
      projectId,
      userId: ctx.userId,
      name,
      description: normalizeOptionalText(args.description?.trim()),
      instructions: normalizeOptionalText(args.instructions?.trim()),
      createdAt: now,
      updatedAt: now,
    });

    return { projectId };
  },
});

export const getProjects = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = results.page.map((project) => ({
      projectId: project.projectId,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    }));

    return {
      page,
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

export const getProject = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();

    if (project === null) {
      return null;
    }
    if (project.userId !== ctx.userId) {
      throw new ConvexError("Project not found");
    }

    return {
      projectId: project.projectId,
      name: project.name,
      description: project.description,
      instructions: project.instructions,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  },
});

export const updateProject = mutation({
  args: {
    projectId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      instructions: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();

    if (project?.userId !== ctx.userId) {
      throw new ConvexError("Project not found");
    }

    const update: Record<string, string | undefined> = {};
    if (args.patch.name !== undefined) {
      const name = args.patch.name.trim().slice(0, 120);
      if (!name) {
        throw new ConvexError("Project name cannot be empty");
      }
      update.name = name;
    }
    if (args.patch.description !== undefined) {
      const description = args.patch.description.trim();
      update.description = description.length > 0 ? description : undefined;
    }
    if (args.patch.instructions !== undefined) {
      const instructions = args.patch.instructions.trim();
      update.instructions = instructions.length > 0 ? instructions : undefined;
    }

    await ctx.db.patch(project._id, {
      ...update,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const deleteProject = mutation({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();

    if (project?.userId !== ctx.userId) {
      throw new ConvexError("Project not found");
    }

    // Unscope threads (keep them; they reappear in the main sidebar)
    const projectThreads = await ctx.db
      .query("threads")
      .withIndex("by_userId_chatProjectId", (q) =>
        q.eq("userId", ctx.userId).eq("chatProjectId", args.projectId),
      )
      .collect();

    for (const thread of projectThreads) {
      await ctx.db.patch(thread._id, {
        chatProjectId: undefined,
        updatedAt: Date.now(),
      });
    }

    // Delete project files and schedule storage/vector cleanup.
    const projectFiles = await ctx.db
      .query("attachments")
      .withIndex("by_chatProjectId", (q) =>
        q.eq("chatProjectId", args.projectId),
      )
      .collect();

    for (const file of projectFiles) {
      if (file.userId !== ctx.userId) continue;
      await ctx.scheduler.runAfter(
        0,
        internal.functions.attachments.internal_deleteFileFromSilo,
        {
          projectId: file.projectId,
          environmentId: file.environmentId,
          fileKeyId: file.fileKeyId,
          accessKey: file.accessKey,
        },
      );
      await deleteAttachmentEmbeddings(ctx, file.attachmentId);
      await ctx.db.delete(file._id);
    }

    await ctx.db.delete(project._id);

    return { success: true };
  },
});

export const getProjectThreads = query({
  args: {
    projectId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("threads")
      .withIndex("by_userId_chatProjectId", (q) =>
        q.eq("userId", ctx.userId).eq("chatProjectId", args.projectId),
      )
      .order("desc")
      .paginate(args.paginationOpts);

    const page = results.page.map((thread) => ({
      threadId: (thread.threadId as string | undefined) ?? thread._id,
      name: thread.name,
      timestamp: thread.updatedAt,
      status: thread.status,
      _creationTime: thread._creationTime,
    }));

    return {
      page,
      isDone: results.isDone,
      continueCursor: results.continueCursor,
    };
  },
});

export const getProjectFiles = query({
  args: { projectId: v.string() },
  handler: async (ctx, args) => {
    // Verify ownership
    const project = await ctx.db
      .query("projects")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .first();

    if (project?.userId !== ctx.userId) {
      return [];
    }

    const files = await ctx.db
      .query("attachments")
      .withIndex("by_chatProjectId", (q) =>
        q.eq("chatProjectId", args.projectId),
      )
      .collect();

    return files
      .filter((file) => file.userId === ctx.userId)
      .map((file) => ({
        attachmentId: file.attachmentId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        accessKey: file.accessKey,
        isPublic: file.isPublic,
        serveImage: file.serveImage,
        createdAt: file.createdAt,
        embeddingStatus: file.embeddingStatus,
        embeddingError: file.embeddingError,
        embeddingChunkCount: file.embeddingChunkCount,
      }));
  },
});

export const deleteProjectFile = mutation({
  args: { attachmentId: v.string() },
  handler: async (ctx, args) => {
    const attachment = await ctx.db
      .query("attachments")
      .withIndex("by_attachmentId", (q) =>
        q.eq("attachmentId", args.attachmentId),
      )
      .first();

    if (attachment?.userId !== ctx.userId) {
      throw new ConvexError("File not found");
    }

    if (!attachment.chatProjectId) {
      throw new ConvexError("Not a project file");
    }

    await ctx.scheduler.runAfter(
      0,
      internal.functions.attachments.internal_deleteFileFromSilo,
      {
        projectId: attachment.projectId,
        environmentId: attachment.environmentId,
        fileKeyId: attachment.fileKeyId,
        accessKey: attachment.accessKey,
      },
    );
    await deleteAttachmentEmbeddings(ctx, args.attachmentId);
    await ctx.db.delete(attachment._id);
    return { success: true };
  },
});
