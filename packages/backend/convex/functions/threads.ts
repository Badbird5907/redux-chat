import { paginationOptsValidator } from "convex/server";
import { backendMutation, mutation,
query, backendQuery } from "./index";
import { ConvexError,
v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { threadSettings } from "../schema";

export const getThreads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    // Query threads by userId, ordered by updatedAt descending
    const results = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("userId"), ctx.user._id))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = results.page.map((thread) => ({
      _id: thread._id,
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

export const getThread = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("threads", args.threadId);
    if (!thread || thread.userId != ctx.user._id  ) {
      throw new ConvexError("Thread not found");
    }
    return thread;
  },
});

export const abortStream = mutation({
  args: { threadId: v.id("threads"), messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const existingThread = await ctx.db.get("threads", args.threadId);
    if (!existingThread || existingThread.userId != ctx.user._id) {
      throw new ConvexError("Thread not found");
    }
    const existingMessage = await ctx.db.get("messages", args.messageId);
    if (!existingMessage || existingMessage.threadId != args.threadId) {
      throw new ConvexError("Message not found");
    }
    await ctx.db.patch("messages", args.messageId, {
      canceledAt: Date.now(),
      status: "completed" // not failed
    });
    await ctx.db.patch("threads", args.threadId, {
      activeStreamId: undefined,
      status: "completed"
    });

    return { success: true };
  },
});

// Get all messages for a thread, walking from root to current leaf
export const getThreadMessages = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }

    if (thread.userId !== ctx.user._id) {
      throw new ConvexError("Unauthorized");
    }

    // Get all messages for this thread
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_thread", (q) => q.eq("threadId", args.threadId))
      .collect();

    // Build path from root to current leaf
    if (!thread.currentLeafMessageId) {
      return [];
    }

    // Build a map for quick lookups
    const messageMap = new Map(allMessages.map((m) => [m._id, m]));

    // Walk backwards from leaf to root to get the path
    const path: typeof allMessages = [];
    let currentId: Id<"messages"> | undefined = thread.currentLeafMessageId;

    while (currentId) {
      const message = messageMap.get(currentId);
      if (!message) break;
      path.unshift(message);
      currentId = message.parentId;
    }

    return path.map((m) => ({
      id: m._id,
      role: m.role,
      content: m.content,
      status: m.status,
      createdAt: m._creationTime,
    }));
  },
});

// Complete the stream - update assistant message with final content
export const internal_completeStream = backendMutation({
  args: {
    threadId: v.id("threads"),
    assistantMessageId: v.id("messages"),
    content: v.string(),
    usage: v.optional(
      v.object({
        promptTokens: v.number(),
        responseTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Update the assistant message
    await ctx.db.patch(args.assistantMessageId, {
      content: args.content,
      status: "completed",
      usage: args.usage,
    });

    // Update the thread
    await ctx.db.patch(args.threadId, {
      status: "completed",
      activeStreamId: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Set the active stream ID for resumable streams
export const internal_setActiveStreamId = backendMutation({
  args: {
    threadId: v.id("threads"),
    streamId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.threadId, {
      activeStreamId: args.streamId,
    });
    return { success: true };
  },
})

export const internal_checkMessageAbort = backendQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      throw new ConvexError("Message not found");
    }
    return message.canceledAt;
  },
});

const sendMessageSchema = v.object({
  content: v.string(),

  // in the future, we can add tools like web search, and attachments
})

export const beginThread = mutation({
  args: {
    name: v.optional(v.string()),
    settings: threadSettings,
    message: sendMessageSchema,
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.insert("threads", {
      userId: ctx.user._id,
      name: args.name ?? "New Thread",
      settings: args.settings,
      status: "generating",
      updatedAt: Date.now(),
    });

    const message = await ctx.db.insert("messages", {
      threadId: thread,
      mutation: { type: "original" },
      role: "user",
      content: args.message.content,
      status: "generating",
      depth: 0,
      siblingIndex: 0,
    });

    return { threadId: thread, messageId: message };
  }
})

export const createMessage = mutation({
  args: {
    threadId: v.id("threads"),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("threads", args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    if (thread.userId !== ctx.user._id) {
      throw new ConvexError("Unauthorized");
    }
    const message = await ctx.db.insert("messages", {
      threadId: args.threadId,
      content: args.content,
      depth: 0,
      siblingIndex: 0,
      role: "user",
      status: "generating",
      mutation: { type: "original" },
    });
    return { messageId: message };
  }
});