import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { Buffer } from "buffer/";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { backendEnv } from "../env";
import { backendMutation, backendQuery, mutation, query } from "./index";

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
      }),
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
    ["sign", "verify"],
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
    userMessage: sendMessageSchema,
    userMessageId: v.string(),
    assistantMessageId: v.string(),
    model: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Decode & verify userMessageId
    const [userMsgId, userSig] = args.userMessageId.split(":");
    if (!userMsgId || !userSig) {
      throw new ConvexError("Invalid userMessageId or signature");
    }
    const userVerified = await verifySignature(userMsgId, userSig);
    if (!userVerified) {
      throw new ConvexError("Invalid user message signature");
    }

    // 2. Decode & verify assistantMessageId
    const [assistantMsgId, assistantSig] = args.assistantMessageId.split(":");
    if (!assistantMsgId || !assistantSig) {
      throw new ConvexError("Invalid assistantMessageId or signature");
    }
    const assistantVerified = await verifySignature(
      assistantMsgId,
      assistantSig,
    );
    if (!assistantVerified) {
      throw new ConvexError("Invalid assistant message signature");
    }

    let threadId = args.threadId;
    const parentId: string | undefined = undefined;
    const depth = 0;
    const siblingIndex = 0;

    // 3. Insert thread if needed
    if (threadId.includes(":")) {
      // is a new thread
      const [actualThreadId, tSig] = threadId.split(":");
      if (!actualThreadId || !tSig) {
        throw new ConvexError("Invalid threadId or signature");
      }
      const verified = await verifySignature(actualThreadId, tSig);
      if (!verified) {
        throw new ConvexError("Invalid thread signature");
      }
      threadId = actualThreadId;

      await ctx.db.insert("threads", {
        threadId,
        userId: ctx.userId,
        name: "New Thread",
        status: "generating",
        updatedAt: Date.now(),
        settings: {
          model: args.model,
          tools: [],
        },
      });
    } else {
      const thread = await ctx.db
        .query("threads")
        .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
        .first();
      if (thread?.userId !== ctx.userId) {
        throw new ConvexError("Thread not found");
      }

      // Update thread status
      await ctx.db.patch(thread._id, {
        status: "generating",
        updatedAt: Date.now(),
      });
    }

    // 4. Insert user message
    await ctx.db.insert("messages", {
      threadId: threadId,
      messageId: userMsgId,
      parentId,
      role: "user",
      parts: args.userMessage.parts as UIMessagePart<UIDataTypes, UITools>[],
      status: "completed",
      depth,
      siblingIndex,
      mutation: { type: "original" },
    });

    // 5. Insert empty assistant message
    await ctx.db.insert("messages", {
      threadId: threadId,
      messageId: assistantMsgId,
      parentId: userMsgId,
      role: "assistant",
      parts: [],
      status: "generating",
      depth: 1,
      siblingIndex: 0,
      mutation: { type: "original" },
    });

    return {
      threadId,
      userMessageId: userMsgId,
      assistantMessageId: assistantMsgId,
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
