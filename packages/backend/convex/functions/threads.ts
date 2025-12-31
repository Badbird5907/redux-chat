import { paginationOptsValidator } from "convex/server";
import { backendMutation, mutation,
query } from "./index";
import { ConvexError,
v } from "convex/values";
import type { Id } from "../_generated/dataModel";

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
    if (!thread) {
      throw new ConvexError("Thread not found");
    }

    return thread;
  },
});

export const internal_cancelStream = backendMutation({
  args: { threadId: v.id("threads"), messageId: v.id("messages") },
  handler: async (ctx, args) => {
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

// Create a new thread with the initial user message and a placeholder assistant message
export const createThread = mutation({
  args: {
    message: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const model = args.model ?? "gpt-4o-mini";

    // Create the thread
    const threadId = await ctx.db.insert("threads", {
      userId: ctx.user._id,
      name: args.message.slice(0, 50) + (args.message.length > 50 ? "..." : ""),
      status: "generating",
      settings: {
        model,
        temperature: 0.7,
        tools: [],
      },
      updatedAt: now,
    });

    // Create the user message
    const userMessageId = await ctx.db.insert("messages", {
      threadId,
      role: "user",
      content: args.message,
      status: "completed",
      depth: 0,
      siblingIndex: 0,
      mutation: { type: "original" },
    });

    // Create placeholder assistant message
    const assistantMessageId = await ctx.db.insert("messages", {
      threadId,
      parentId: userMessageId,
      role: "assistant",
      content: "",
      status: "generating",
      depth: 1,
      siblingIndex: 0,
      mutation: { type: "original" },
      model,
    });

    // Update thread with current leaf message
    await ctx.db.patch(threadId, {
      currentLeafMessageId: assistantMessageId,
    });

    return {
      threadId,
      userMessageId,
      assistantMessageId,
    };
  },
});

// Add a new message to an existing thread
export const addMessage = mutation({
  args: {
    threadId: v.id("threads"),
    message: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }

    if (thread.userId !== ctx.user._id) {
      throw new ConvexError("Unauthorized");
    }

    const model = args.model ?? thread.settings.model;

    // Get current depth from the leaf message
    let depth = 0;
    let parentId: Id<"messages"> | undefined;
    
    if (thread.currentLeafMessageId) {
      const leafMessage = await ctx.db.get(thread.currentLeafMessageId);
      if (leafMessage) {
        depth = leafMessage.depth + 1;
        parentId = thread.currentLeafMessageId;
      }
    }

    // Count siblings at this depth for siblingIndex
    const siblings = await ctx.db
      .query("messages")
      .withIndex("by_parent", (q) => q.eq("parentId", parentId))
      .collect();

    // Create the user message
    const userMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      parentId,
      role: "user",
      content: args.message,
      status: "completed",
      depth,
      siblingIndex: siblings.length,
      mutation: { type: "original" },
    });

    // Create placeholder assistant message
    const assistantMessageId = await ctx.db.insert("messages", {
      threadId: args.threadId,
      parentId: userMessageId,
      role: "assistant",
      content: "",
      status: "generating",
      depth: depth + 1,
      siblingIndex: 0,
      mutation: { type: "original" },
      model,
    });

    // Update thread
    await ctx.db.patch(args.threadId, {
      currentLeafMessageId: assistantMessageId,
      status: "generating",
      updatedAt: Date.now(),
    });

    return {
      userMessageId,
      assistantMessageId,
    };
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
export const completeStream = backendMutation({
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
export const setActiveStreamId = backendMutation({
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
