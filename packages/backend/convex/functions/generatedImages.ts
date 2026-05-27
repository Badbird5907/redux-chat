import { ConvexError, v } from "convex/values";

import { backendMutation } from "./index";

export const internal_create = backendMutation({
  args: {
    userId: v.string(),
    generatedImageId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    modelId: v.string(),
    provider: v.string(),
    toolCallId: v.optional(v.string()),
    prompt: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
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
    await ctx.db.insert("generatedImages", {
      generatedImageId: args.generatedImageId,
      userId: args.userId,
      threadId: args.threadId,
      messageId: args.messageId,
      modelId: args.modelId,
      provider: args.provider,
      source: "image_generation",
      toolCallId: args.toolCallId,
      prompt: args.prompt,
      mimeType: args.mimeType,
      size: args.size,
      width: args.width,
      height: args.height,
      projectId: args.projectId,
      environmentId: args.environmentId,
      accessKey: args.accessKey,
      fileKeyId: args.fileKeyId,
      fileName: args.fileName,
      createdAt: now,
    });

    return { generatedImageId: args.generatedImageId };
  },
});
