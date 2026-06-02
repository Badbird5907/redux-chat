import { ConvexError, v } from "convex/values";

import { backendMutation } from "./index";

const kindValidator = v.union(v.literal("image"), v.literal("file"));
const sourceValidator = v.union(
  v.literal("image_generation"),
  v.literal("shell"),
  v.literal("e2b"),
);

export const internal_create = backendMutation({
  args: {
    userId: v.string(),
    modelGeneratedFileId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    kind: kindValidator,
    source: sourceValidator,
    modelId: v.optional(v.string()),
    provider: v.optional(v.string()),
    toolCallId: v.optional(v.string()),
    prompt: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
    image: v.optional(
      v.object({
        width: v.optional(v.number()),
        height: v.optional(v.number()),
      }),
    ),
    projectId: v.string(),
    environmentId: v.string(),
    accessKey: v.string(),
    fileKeyId: v.string(),
    fileName: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();

    if (thread?.userId !== args.userId) {
      throw new ConvexError("Thread not found");
    }

    const message = await ctx.db
      .query("messages")
      .withIndex("by_threadId_messageId", (q) =>
        q.eq("threadId", args.threadId).eq("messageId", args.messageId),
      )
      .first();

    if (message?.role !== "assistant") {
      throw new ConvexError("Assistant message not found");
    }

    const now = Date.now();
    await ctx.db.insert("modelGeneratedFiles", {
      modelGeneratedFileId: args.modelGeneratedFileId,
      userId: args.userId,
      threadId: args.threadId,
      messageId: args.messageId,
      kind: args.kind,
      source: args.source,
      modelId: args.modelId,
      provider: args.provider,
      toolCallId: args.toolCallId,
      prompt: args.prompt,
      mimeType: args.mimeType,
      size: args.size,
      image: args.image,
      projectId: args.projectId,
      environmentId: args.environmentId,
      accessKey: args.accessKey,
      fileKeyId: args.fileKeyId,
      fileName: args.fileName,
      createdAt: now,
    });

    return { modelGeneratedFileId: args.modelGeneratedFileId };
  },
});
