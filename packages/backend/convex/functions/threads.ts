import { paginationOptsValidator } from "convex/server";
import { backendMutation, mutation, query, backendQuery } from "./index";
import { ConvexError, v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { threadSettings } from "../schema";
import { authComponent } from "../auth";
import { backendEnv } from "../env";
import { nanoid } from "nanoid";
import { Buffer } from "buffer/";

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

    if (!thread || thread.userId != ctx.user._id) {
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

    if (!thread || thread.userId != ctx.user._id) {
      throw new ConvexError("Thread not found");
    }

    const message = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("messageId"), args.messageId))
      .first();

    if (!message || message.threadId != args.threadId) {
      throw new ConvexError("Message not found");
    }

    await ctx.db.patch(message._id, {
      canceledAt: Date.now(),
      status: "completed", // not failed
    });
    await ctx.db.patch(thread._id, {
      activeStreamId: undefined,
      status: "completed",
    });

    return { success: true };
  },
});

// Get all messages for a thread, walking from root to current leaf
export const getThreadMessages = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

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
    const messageMap = new Map(allMessages.map((m) => [m.messageId, m]));

    // Walk backwards from leaf to root to get the path
    const path: typeof allMessages = [];
    let currentId: string | undefined = thread.currentLeafMessageId;

    while (currentId) {
      const message = messageMap.get(currentId);
      if (!message) break;
      path.unshift(message);
      currentId = message.parentId;
    }

    return path.map((m) => ({
      id: m.messageId,
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
    threadId: v.string(),
    assistantMessageId: v.string(),
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
      content: args.content as unknown,
      status: "completed",
      usage: args.usage,
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
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// Set the active stream ID for resumable streams
export const internal_setActiveStreamId = backendMutation({
  args: {
    threadId: v.string(),
    streamId: v.string(),
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
  content: v.any(),

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
  enc: TextEncoder
): Promise<boolean> => {
  const env = backendEnv();
  const key = await importKey(env.INTERNAL_CONVEX_SECRET, enc);
  const messageData = enc.encode(message);
  const signatureBuffer = Buffer.from(signature, "base64");

  return crypto.subtle.verify("HMAC", key, signatureBuffer, messageData);
};

export const beginThread = mutation({
  args: {
    threadId: v.string(),
    name: v.optional(v.string()),
    settings: threadSettings,
    message: sendMessageSchema,
  },
  handler: async (ctx, args) => {
    const [id, signature] = args.threadId.split(":");
    if (!id || !signature || !(await verifySignature(id, signature, new TextEncoder()))) {
      throw new ConvexError("Invalid id/sig");
    }
    
    // Insert thread
    const threadIdStr = id;
    const threadInternalId = await ctx.db.insert("threads", {
      threadId: threadIdStr,
      userId: ctx.user._id,
      name: args.name ?? "New Thread",
      settings: args.settings,
      status: "generating",
      updatedAt: Date.now(),
    });

    const userMessageId = nanoid();
    await ctx.db.insert("messages", {
      threadId: threadIdStr,
      messageId: userMessageId,
      mutation: { type: "original" },
      role: "user",
      content: args.message.content as unknown,
      status: "completed", // user message is always completed
      depth: 0,
      siblingIndex: 0,
    });

    const assistantMessageId = nanoid();
    await ctx.db.insert("messages", {
      threadId: threadIdStr,
      messageId: assistantMessageId,
      mutation: { type: "original" },
      role: "assistant",
      content: "",
      status: "generating",
      depth: 0,
      siblingIndex: 0,
      parentId: userMessageId,
    });

    await ctx.db.patch(threadInternalId, {
      currentLeafMessageId: assistantMessageId,
    });

    return {
      threadId: threadIdStr,
      messageId: userMessageId,
      assistantMessageId: assistantMessageId,
    };
  },
});

export const createMessage = mutation({
  args: {
    threadId: v.string(),
    content: v.any(),
    idPair: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    if (thread.userId !== ctx.user._id) {
      throw new ConvexError("Unauthorized");
    }
    
    let lastMessage = null;
    if (thread.currentLeafMessageId) {
        lastMessage = await ctx.db
            .query("messages")
            .filter(q => q.eq(q.field("messageId"), thread.currentLeafMessageId))
            .first();
    }

    // id1.sig1:id2.sig2
    const pairs = args.idPair.split(":").map((s) => s.split("."));
    const [id1, sig1] = pairs[0] ?? [];
    const [id2, sig2] = pairs[1] ?? [];
    if (
      !id1 ||
      !sig1 ||
      !id2 ||
      !sig2 ||
      !(await verifySignature(id1, sig1, new TextEncoder())) ||
      !(await verifySignature(id2, sig2, new TextEncoder()))
    ) {
      throw new ConvexError("Invalid id/sig");
    }

    const userMessageId = id2;
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      messageId: userMessageId,
      parentId: thread.currentLeafMessageId,
      content: args.content as unknown,
      depth: lastMessage ? lastMessage.depth + 1 : 0,
      siblingIndex: lastMessage ? lastMessage.siblingIndex + 1 : 0,
      role: "user",
      status: "completed", // user message is always completed
      mutation: { type: "original" },
    });

    const assistantMessageId = nanoid();
    await ctx.db.insert("messages", {
      threadId: args.threadId,
      messageId: assistantMessageId,
      parentId: userMessageId,
      content: "",
      depth: 0,
      siblingIndex: 0,
      role: "assistant",
      status: "generating",
      mutation: { type: "original" },
    });

    await ctx.db.patch(thread._id, {
      currentLeafMessageId: assistantMessageId,
      activeStreamId: undefined,
      status: "generating",
    });
    return { messageId: userMessageId, assistantMessageId: assistantMessageId };
  },
});

export const internal_prepareStream = backendQuery({
  // this function returns all the data needed to stream
  args: {
    threadId: v.string(),
    userMessageId: v.string(),
    assistantMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    // we send auth over bearer token too, so we need to validate it
    const user = await authComponent.getAuthUser(ctx);
    console.log("Authenticated user:", user);

    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    const userMessage = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("messageId"), args.userMessageId))
      .first();

    const assistantMessage = await ctx.db
        .query("messages")
        .filter((q) => q.eq(q.field("messageId"), args.assistantMessageId))
        .first();

    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    if (!userMessage || !assistantMessage) {
      throw new ConvexError("User message or assistant message not found");
    }
    if (
      userMessage.threadId !== thread.threadId ||
      assistantMessage.threadId !== thread.threadId
    ) {
      throw new ConvexError("Message does not belong to thread");
    }
    if (userMessage.role !== "user" || assistantMessage.role !== "assistant") {
      throw new ConvexError("Message is not a user or assistant message");
    }

    // Walk up the message tree to get conversation history
    // Start from the given message and traverse up via parentId
    const conversationHistory: {
      id: string; 
      role: "user" | "assistant" | "system";
      content: unknown;
    }[] = [
      {
        id: userMessage.messageId,
        role: userMessage.role,
        content: userMessage.content,
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
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
        .query("threads")
        .filter((q) => q.eq(q.field("threadId"), args.threadId))
        .first();

    if (!thread) {
      throw new ConvexError("Thread not found");
    }
    return thread.activeStreamId;
  },
});