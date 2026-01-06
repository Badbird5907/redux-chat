import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { authComponent } from "../auth";
import { threadSettings } from "../schema";
import { backendMutation, backendQuery, mutation, query } from "./index";
import { internal } from "../_generated/api";
// eslint-disable-next-line
import { internalMutation } from "../_generated/server";

export const getThreads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    // Query threads by userId, ordered by updatedAt descending
    const results = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("userId"), ctx.user._id))
      .filter((q) => q.eq(q.field("pregenerated"), false))
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
    if (!thread || thread.userId != ctx.user._id) {
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
      status: "completed", // not failed
    });
    await ctx.db.patch("threads", args.threadId, {
      activeStreamId: undefined,
      status: "completed",
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
    userId: v.string(),
    usage: v.optional(
      v.object({
        promptTokens: v.number(),
        responseTokens: v.number(),
        totalTokens: v.number(),
      }),
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

    await ctx.scheduler.runAfter(0, internal.functions.threads.createPregeneratedThread, { userId: args.userId })

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
});

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
});

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
      pregenerated: false,
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

    return {
      threadId: thread,
      messageId: message,
      assistantMessageId: assistantMessage,
    };
  },
});

export const getPregeneratedThreadInfo = query({
  handler: async (ctx) => {
    const thread = await ctx.db
        .query("threads")
        .withIndex("by_pregenerated", (q) =>
          q.eq("pregenerated", true).eq("userId", ctx.user._id),
        )
        .first();
    if (!thread) return { none: true }
    const [userMessage, assistantMessage] = await Promise.all([
      ctx.db
        .query("messages")
        .withIndex("by_pregenerated", (q) => q.eq("pregenerated", ctx.user._id).eq("threadId", thread._id).eq("role", "user"))
        .first(),
      ctx.db
        .query("messages")
        .withIndex("by_pregenerated", (q) => q.eq("pregenerated", ctx.user._id).eq("threadId", thread._id).eq("role", "assistant"))
        .first(),
    ]);

    return {
      threadId: thread._id,
      userMessage: userMessage?._id,
      assistantMessage: assistantMessage?._id,
    };
  },
});

export const createPregeneratedThread = internalMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const existingThreads = await ctx.db
      .query("threads")
      .withIndex("by_pregenerated", (q) =>
        q.eq("pregenerated", true).eq("userId", args.userId),
      )
      .collect();

    if (existingThreads.length > 1) {
      existingThreads.sort((a, b) => b.updatedAt - a.updatedAt);
      const threadsToDelete = existingThreads.slice(1);
      await Promise.all(threadsToDelete.map((t) => ctx.db.delete(t._id)));
    }

    let threadId = existingThreads[0]?._id;
    let userMessageId: Id<"messages"> | undefined;
    let assistantMessageId: Id<"messages"> | undefined;

    if (threadId) {
      const tId = threadId; 
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_pregenerated", (q) =>
          q.eq("pregenerated", args.userId).eq("threadId", tId),
        )
        .collect();

      const userMessage = messages.find((m) => m.role === "user");
      const assistantMessage = messages.find((m) => m.role === "assistant");

      if (userMessage && assistantMessage) {
        userMessageId = userMessage._id;
        assistantMessageId = assistantMessage._id;
      } else {
        await ctx.db.delete(threadId);
        await Promise.all(messages.map((m) => ctx.db.delete(m._id)));
        threadId = undefined;
      }
    }

    if (!threadId) {
      const thread = await ctx.db.insert("threads", {
        userId: args.userId,
        name: "New Thread",
        status: "completed",
        updatedAt: Date.now(),
        pregenerated: true,
        settings: {
          model: "gpt-4o",
          temperature: 0.7,
          tools: [],
        },
      });

      const message = await ctx.db.insert("messages", {
        threadId: thread,
        mutation: { type: "original" },
        role: "user",
        content: "",
        status: "completed",
        depth: 0,
        siblingIndex: 0,
        pregenerated: args.userId,
      });

      const assistant = await ctx.db.insert("messages", {
        threadId: thread,
        mutation: { type: "original" },
        role: "assistant",
        content: "",
        status: "completed",
        depth: 0,
        siblingIndex: 0,
        parentId: message,
        pregenerated: args.userId,
      });

      await ctx.db.patch(thread, {
        currentLeafMessageId: assistant,
      });

      threadId = thread;
      userMessageId = message;
      assistantMessageId = assistant;
    }

    if (!threadId || !userMessageId || !assistantMessageId) {
      throw new ConvexError("Failed to create or retrieve pregenerated thread");
    }

    return {
      threadId,
      userMessageId,
      assistantMessageId,
    };
  },
})

export const pregeneratedThreadUse = mutation({
  args: { threadId: v.id("threads"), messageId: v.id("messages"), assistantMessageId: v.id("messages"), message: sendMessageSchema },
  handler: async (ctx, args) => {
    const [thread, message, assistantMessage] = await Promise.all([
      ctx.db.get("threads", args.threadId),
      ctx.db.get("messages", args.messageId),
      ctx.db.get("messages", args.assistantMessageId),
    ])
    // a shitload of sanity checks
    if (!thread || thread.userId !== ctx.user._id ||
        !thread.pregenerated || message?.pregenerated !== ctx.user._id ||
        assistantMessage?.pregenerated !== ctx.user._id) {
      throw new ConvexError("Pregenerated thread or messages not found");
    }
    
    // all is good, we can use this thread
    await ctx.db.patch("threads", thread._id, {
      pregenerated: false
    })
    await ctx.db.patch("messages", message._id, {
      pregenerated: undefined,
      content: args.message.content,
    })
    await ctx.db.patch("messages", assistantMessage._id, {
      pregenerated: undefined,
    })
    await ctx.scheduler.runAfter(0, internal.functions.threads.createPregeneratedThread, { userId: ctx.user._id })
    return {
      threadId: thread._id,
      userMessageId: message._id,
      assistantMessageId: assistantMessage._id,
    }
  }
})

export const createMessage = mutation({
  args: {
    threadId: v.id("threads"),
    message: sendMessageSchema,
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
      content: args.message.content,
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
      status: "generating",
    });
    return { messageId: message, assistantMessageId: assistantMessage };
  },
});

export const internal_prepareStream = backendQuery({
  // this function returns all the data needed to stream
  args: {
    threadId: v.id("threads"),
    userMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
  },
  handler: async (ctx, args) => {
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
    if (
      userMessage.threadId !== thread._id ||
      assistantMessage.threadId !== thread._id
    ) {
      throw new ConvexError("Message does not belong to thread");
    }
    console.log(userMessage)
    console.log(assistantMessage)
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
      const currentMessage: Doc<"messages"> | null = await ctx.db.get(
        "messages",
        currentId,
      );
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
  },
});

export const getThreadStreamId = query({
  args: { threadId: v.id("threads") },
  handler: async (ctx, args) => {
    const thread = await ctx.db.get("threads", args.threadId);
    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    return thread.activeStreamId;
  },
});
