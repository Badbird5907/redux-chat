import { paginationOptsValidator } from "convex/server";
import { backendMutation, mutation, query, backendQuery } from "./index";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { backendEnv } from "../env";
import { nanoid } from "nanoid";
import { Buffer } from "buffer/";
import type { UIDataTypes, UIMessage, UIMessagePart, UITools } from "ai";

export const getThreads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    // Query threads by userId, ordered by updatedAt descending
    const results = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("userId"), ctx.userId))
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

export const getThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (thread?.userId != ctx.userId) {
      throw new ConvexError("Thread not found");
    }
    return thread;
  },
});

export const abortStream = mutation({
  args: { threadId: v.string(), messageId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (thread?.userId != ctx.userId) {
      throw new ConvexError("Thread not found");
    }

    const message = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    if (message?.threadId != args.threadId) {
      throw new ConvexError("Message not found");
    }

    await ctx.db.patch(message._id, {
      canceledAt: Date.now(),
      status: "completed", // not failed
    });
    await ctx.db.patch(thread._id, {
      activeStreamId: undefined,
      activeStreamClientId: undefined,
      status: "completed",
    });

    return { success: true };
  },
});

// Get all messages for a thread - client decides which branch to display
export const getThreadMessages = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (!thread) {
      return [];
    }

    if (thread.userId !== ctx.userId) {
      console.log(thread.userId, ctx.userId);
      throw new ConvexError("Unauthorized");
    }

    // Get all messages for this thread
    const allMessages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();

    return allMessages.map((m) => ({
      ...m,
      id: m.messageId,
    }));
  },
});

// Complete the stream - update assistant message with final content
export const internal_completeStream = backendMutation({
  args: {
    threadId: v.string(),
    assistantMessageId: v.string(),
    parts: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    // Find assistant message
    const assistantMessage = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("messageId"), args.assistantMessageId))
      .first();

    if (!assistantMessage) {
      throw new ConvexError("Assistant message not found");
    }

    // Update the assistant message
    await ctx.db.patch(assistantMessage._id, {
      parts: args.parts as UIMessagePart<UIDataTypes, UITools>[],
      status: "completed",
    });

    // Find thread
    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (!thread) {
      throw new ConvexError("Thread not found");
    }

    // Update the thread
    await ctx.db.patch(thread._id, {
      status: "completed",
      activeStreamId: undefined,
      activeStreamClientId: undefined,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const internal_updateMessageUsage = backendMutation({
  args: {
    messageId: v.string(),
    usage: v.object({
      promptTokens: v.number(),
      responseTokens: v.number(),
      totalTokens: v.number(),
    }),
    generationStats: v.optional(
      v.object({
        timeToFirstTokenMs: v.number(),
        totalDurationMs: v.number(),
        tokensPerSecond: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();
    if (!message) {
      throw new ConvexError("Message not found");
    }
    await ctx.db.patch(message._id, {
      usage: args.usage,
      generationStats: args.generationStats,
    });
  },
});

// Set the active stream ID for resumable streams
export const internal_setActiveStreamId = backendMutation({
  args: {
    threadId: v.string(),
    streamId: v.string(),
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (!thread) {
      throw new ConvexError("Thread not found");
    }

    await ctx.db.patch(thread._id, {
      activeStreamId: args.streamId,
      activeStreamClientId: args.clientId,
    });
    return { success: true };
  },
});

export const internal_checkMessageAbort = backendQuery({
  args: { messageId: v.string() },
  handler: async (ctx, args) => {
    const message = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    if (!message) {
      throw new ConvexError("Message not found");
    }
    return message.canceledAt;
  },
});

const sendMessageSchema = v.object({
  parts: v.array(v.any()),

  // in the future, we can add tools like web search, and attachments
});

async function importKey(secret: string, enc: TextEncoder): Promise<CryptoKey> {
  const keyData = enc.encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export const verifySignature = async (
  message: string,
  signature: string,
): Promise<boolean> => {
  const env = backendEnv();
  const enc = new TextEncoder();
  const key = await importKey(env.INTERNAL_CONVEX_SECRET, enc);
  const messageData = enc.encode(message);
  const signatureBuffer = Buffer.from(signature, "base64");

  return crypto.subtle.verify("HMAC", key, signatureBuffer, messageData);
};

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    message: sendMessageSchema,
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const [messageId, sig] = args.messageId.split(":");
    if (!messageId || !sig) {
      throw new ConvexError("Invalid messageId or signature");
    }
    const verified = await verifySignature(messageId, sig);
    if (!verified) {
      throw new ConvexError("Invalid signature");
    }

    let threadId = args.threadId;
    const parentId: string | undefined = undefined;
    const depth = 0;
    const siblingIndex = 0;

    if (threadId.includes(":")) { // is a new thread
      const [actualThreadId, tSig] = threadId.split(":");
      if (!actualThreadId || !tSig) {
        throw new ConvexError("Invalid threadId or messageId");
      }
      const verified = await verifySignature(actualThreadId, tSig);
      if (!verified) {
        throw new ConvexError("Invalid signature");
      }
      threadId = actualThreadId;
      
      await ctx.db.insert("threads", {
        threadId,
        userId: ctx.userId,
        name: "New Thread",
        status: "generating",
        updatedAt: Date.now(),
        settings: {
          model: "gpt-4o",
          temperature: 0.7,
          tools: [],
        },
      })
    } else {
      const thread = await ctx.db.query("threads").withIndex("by_threadId", (q) => q.eq("threadId", args.threadId)).first();
      if (thread?.userId !== ctx.userId) {
        throw new ConvexError("Thread not found");
      }

      // Update thread status
      await ctx.db.patch(thread._id, {
        status: "generating",
        updatedAt: Date.now(),
      });
    }

    await ctx.db.insert("messages", {
      threadId: threadId,
      messageId,
      parentId,
      role: "user",
      parts: args.message.parts as UIMessagePart<UIDataTypes, UITools>[],
      status: "completed",
      depth,
      siblingIndex,
      mutation: { type: "original" },
    })
    return { threadId, messageId };
  }
})

export const internal_prepareStream = backendMutation({
  // this function returns all the data needed to stream
  args: {
    threadId: v.string(),
    userMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    // we send auth over bearer token too, so we need to validate it
    const [thread, userMessage] = await Promise.all([
      ctx.db
        .query("threads")
        .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
        .first(),
      ctx.db
        .query("messages")
        .withIndex("by_threadId_messageId", (q) => q.eq("threadId", args.threadId).eq("messageId", args.userMessageId))
        .first(),
    ]);

    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    if (!userMessage) {
      throw new ConvexError("User message not found");
    }
    if (
      userMessage.threadId !== thread.threadId
    ) {
      throw new ConvexError("Message does not belong to thread");
    }
    if (userMessage.role !== "user") {
      throw new ConvexError("Message is not a user message");
    }

    // Walk up the message tree to get conversation history
    // Start from the given message and traverse up via parentId
    const conversationHistory: UIMessage<unknown, UIDataTypes, UITools>[] = [
      {
        id: userMessage.messageId,
        role: userMessage.role,
        parts: userMessage.parts as UIMessagePart<UIDataTypes, UITools>[],
      },
    ];

    let currentId: string | undefined = userMessage.parentId;

    // Collect messages from leaf to root
    while (currentId) {
      const currentMessage: Doc<"messages"> | null = await ctx.db
        .query("messages")
        .filter(q => q.eq(q.field("messageId"), currentId))
        .first();

      if (!currentMessage) break;

      conversationHistory.unshift({
        id: currentMessage.messageId,
        role: currentMessage.role,
        parts: currentMessage.parts as UIMessagePart<UIDataTypes, UITools>[],
      });

      currentId = currentMessage.parentId;
    }
    
    // insert a new assistant message
    const assistantMessageId = nanoid();
    const assistantMessage: Omit<Doc<"messages">, "_creationTime" | "_id"> = {
      threadId: args.threadId,
      messageId: assistantMessageId,
      parentId: userMessage.messageId,
      role: "assistant",
      parts: [],
      status: "generating",
      depth: 0,
      siblingIndex: 0,
      mutation: { type: "original" },
    }
    await ctx.db.insert("messages", assistantMessage);

    return {
      thread,
      userMessage,
      conversationHistory,
      settings: thread.settings,
      assistantMessage,
    };
  },
});

export const getThreadStreamId = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    console.log("filtering by threadId", args.threadId);
    const thread = await ctx.db
        .query("threads")
        .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
        .first();

    if (thread?.userId !== ctx.userId) {
      return undefined;
    }
    if (!thread.activeStreamId) {
      return undefined;
    }
    return {
      streamId: thread.activeStreamId,
      clientId: thread.activeStreamClientId,
    };
  },
});
