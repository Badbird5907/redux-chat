import { paginationOptsValidator } from "convex/server";
import { backendMutation, mutation,
query, backendQuery } from "./index";
import { ConvexError,
v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { threadSettings } from "../schema";
import { authComponent } from "../auth";

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
      content: m.content as unknown,
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
    content: v.any(), // accepted as string or array
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
      content: args.content as unknown,
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
  content: v.any(),

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
      content: args.message.content as unknown,
      status: "completed", // user message is always completed
      depth: 0,
      siblingIndex: 0,
    });

    const assistantMessage = await ctx.db.insert("messages", {
      threadId: thread,
      mutation: { type: "original" },
      role: "assistant",
      content: "",
      status: "generating",
      depth: 0,
      siblingIndex: 0,
      parentId: message,
    });

    await ctx.db.patch("threads", thread, {
      currentLeafMessageId: assistantMessage,
    });

    return { threadId: thread, messageId: message, assistantMessageId: assistantMessage };
  }
})

export const createMessage = mutation({
  args: {
    threadId: v.id("threads"),
    content: v.any(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("threads", args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    if (thread.userId !== ctx.user._id) {
      throw new ConvexError("Unauthorized");
    }
    const lastMessage = thread.currentLeafMessageId 
      ? await ctx.db.get("messages", thread.currentLeafMessageId)
      : null;
    const message = await ctx.db.insert("messages", {
      threadId: args.threadId,
      parentId: thread.currentLeafMessageId,
      content: args.content as unknown ,
      depth: lastMessage ? lastMessage.depth + 1 : 0,
      siblingIndex: lastMessage ? lastMessage.siblingIndex + 1 : 0,
      role: "user",
      status: "completed", // user message is always completed
      mutation: { type: "original" },
    });
    const assistantMessage = await ctx.db.insert("messages", {
      threadId: args.threadId,
      parentId: message,
      content: "",
      depth: 0,
      siblingIndex: 0,
      role: "assistant",
      status: "generating",
      mutation: { type: "original" },
    });
    await ctx.db.patch("threads", args.threadId, {
      currentLeafMessageId: assistantMessage,
      activeStreamId: undefined,
      status: "generating"  
    });
    return { messageId: message, assistantMessageId: assistantMessage };
  }
});

export const internal_prepareStream = backendQuery({ // this function returns all the data needed to stream
  args: {
    threadId: v.id("threads"),
    userMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
    // we send auth over bearer token too, so we need to validate it
    const user = await authComponent.getAuthUser(ctx);
    console.log("Authenticated user:", user);

    const [thread, userMessage, assistantMessage] = await Promise.all([
      ctx.db.get("threads", args.threadId),
      ctx.db.get("messages", args.userMessageId),
      ctx.db.get("messages", args.assistantMessageId),
    ]);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    if (!userMessage || !assistantMessage) {
      throw new ConvexError("User message or assistant message not found");
    }
    if (userMessage.threadId !== thread._id || assistantMessage.threadId !== thread._id) {
      throw new ConvexError("Message does not belong to thread");
    }
    if (userMessage.role !== "user" || assistantMessage.role !== "assistant") {
      throw new ConvexError("Message is not a user or assistant message");
    }
    
    // Walk up the message tree to get conversation history
    // Start from the given message and traverse up via parentId
    const conversationHistory: {
      id: Id<"messages">;
      role: "user" | "assistant" | "system";
      content: unknown;
    }[] = [
      {
        id: userMessage._id,
        role: userMessage.role,
        content: userMessage.content,
      },
    ];
    
    let currentId: Id<"messages"> | undefined = userMessage.parentId;
    
    // Collect messages from leaf to root
    while (currentId) {
      const currentMessage: Doc<"messages"> | null = await ctx.db
        .get("messages", currentId);
      if (!currentMessage) break;
      
      conversationHistory.unshift({
        id: currentMessage._id,
        role: currentMessage.role,
        content: currentMessage.content,
      });
      
      currentId = currentMessage.parentId;
    }
    
    return {
      thread,
      userMessage,
      assistantMessage,
      conversationHistory,
      settings: thread.settings,
    };
  }
})

export const getThreadStreamId = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("threads", args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    return thread.activeStreamId;
  }
})