import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";
import { Buffer } from "buffer/";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { mergeMessageSettings, normalizeMessageSettings } from "@redux/types";

import { internal } from "../_generated/api";
import { backendEnv } from "../env";
import { attachDraftAttachmentsToMessage } from "./attachments";
import { backendMutation, backendQuery, mutation, query } from "./index";
import { internalAction, internalMutation } from "./internal";

export const getThreads = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    // Use the compound userId+updatedAt index so pagination stays stable
    // when a new thread is inserted or an existing one is updated.
    // Exclude project-scoped threads — those belong to /projects/$id pages.
    const results = await ctx.db
      .query("threads")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("chatProjectId"), undefined))
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

export const searchThreads = query({
  args: {
    search: v.string(),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const search = args.search.trim().toLowerCase();
    const limit = Math.max(1, Math.min(Math.floor(args.limit), 25));

    const threads = await ctx.db
      .query("threads")
      .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
      .filter((q) => q.eq(q.field("chatProjectId"), undefined))
      .order("desc")
      .collect();

    const filteredThreads =
      search.length === 0
        ? threads
        : threads.filter((thread) =>
            thread.name.toLowerCase().includes(search),
          );

    return filteredThreads.slice(0, limit).map((thread) => ({
      threadId: (thread.threadId as string | undefined) ?? thread._id,
      name: thread.name,
      timestamp: thread.updatedAt,
      status: thread.status,
      _creationTime: thread._creationTime,
    }));
  },
});

export const getThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (thread === null) {
      return null;
    }
    if (thread.userId !== ctx.userId) {
      throw new ConvexError("Thread not found");
    }

    return {
      ...thread,
      settings: normalizeMessageSettings(thread.settings),
    };
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

    if (thread === null) {
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

    const allAttachments = await ctx.db
      .query("attachments")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();

    const attachmentsByMessageId = new Map<
      string,
      {
        attachmentId: string;
        fileName: string;
        mimeType: string;
        size: number;
        serveImage: boolean;
        isPublic: boolean;
        expiresAt: number | undefined;
      }[]
    >();

    for (const attachment of allAttachments) {
      if (!attachment.messageId) {
        continue;
      }

      const existing = attachmentsByMessageId.get(attachment.messageId) ?? [];
      existing.push({
        attachmentId: attachment.attachmentId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        serveImage: attachment.serveImage,
        isPublic: attachment.isPublic,
        expiresAt: attachment.expiresAt,
      });
      attachmentsByMessageId.set(attachment.messageId, existing);
    }

    return allMessages.map((m) => ({
      ...m,
      id: m.messageId,
      attachments: attachmentsByMessageId.get(m.messageId) ?? [],
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

function extractUserPrompt(parts: UIMessagePart<UIDataTypes, UITools>[]) {
  const text = parts
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string"
        ? [part.text.trim()]
        : [],
    )
    .filter(Boolean)
    .join("\n")
    .trim();

  return text.length > 0 ? text : undefined;
}

function sanitizeThreadTitle(rawTitle: string) {
  const title = rawTitle
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!title) {
    return undefined;
  }

  return title.slice(0, 80);
}

export const sendMessage = mutation({
  args: {
    threadId: v.string(),
    userMessage: sendMessageSchema,
    userMessageId: v.string(),
    assistantMessageId: v.string(),
    model: v.string(),
    settings: v.object({
      model: v.string(),
      tools: v.object({
        search: v.optional(v.object({})),
        analysisWorkspace: v.optional(
          v.object({
            syncUploads: v.optional(v.boolean()),
          }),
        ),
      }),
    }),
    attachmentIds: v.optional(v.array(v.string())),
    chatProjectId: v.optional(v.string()),
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
    let createdNewThread = false;
    const parentId: string | undefined = undefined;
    const depth = 0;
    const siblingIndex = 0;
    const normalizedSettings = normalizeMessageSettings(args.settings);

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

      // If creating a project-scoped thread, verify the project belongs to this user.
      if (args.chatProjectId) {
        const project = await ctx.db
          .query("projects")
          .withIndex("by_projectId", (q) =>
            q.eq("projectId", args.chatProjectId ?? ""),
          )
          .first();
        if (project?.userId !== ctx.userId) {
          throw new ConvexError("Project not found");
        }
      }

      await ctx.db.insert("threads", {
        threadId,
        userId: ctx.userId,
        name: "New Thread",
        status: "generating",
        updatedAt: Date.now(),
        settings: normalizedSettings,
        chatProjectId: args.chatProjectId,
      });
      createdNewThread = true;
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

    if (args.attachmentIds?.length) {
      await attachDraftAttachmentsToMessage(ctx, {
        attachmentIds: args.attachmentIds,
        threadId,
        messageId: userMsgId,
      });
    }

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
      model: args.model,
    });

    const userPrompt = extractUserPrompt(
      args.userMessage.parts as UIMessagePart<UIDataTypes, UITools>[],
    );

    if (createdNewThread && userPrompt) {
      await ctx.scheduler.runAfter(
        0,
        internal.functions.threads.internal_generateThreadTitle,
        {
          threadId,
          prompt: userPrompt,
        },
      );
    }

    return {
      threadId,
      userMessageId: userMsgId,
      assistantMessageId: assistantMsgId,
    };
  },
});

export const internal_setThreadTitle = internalMutation({
  args: {
    threadId: v.string(),
    generated: v.boolean(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();

    if (!thread || (thread.name !== "New Thread" && args.generated)) {
      return;
    }

    await ctx.db.patch(thread._id, {
      name: args.title,
      updatedAt: Date.now(),
    });
  },
});

export const internal_generateThreadTitle = internalAction({
  args: {
    threadId: v.string(),
    prompt: v.string(),
  },
  handler: async (ctx, args) => {
    const env = backendEnv();

    const openrouter = createOpenRouter({
      apiKey: env.OPENROUTER_API_KEY,
    });

    try {
      const { text } = await generateText({
        model: openrouter.chat("google/gemini-3.1-flash-lite-preview"),
        prompt: [
          "Generate a short chat thread title for the user's first message.",
          "Return only the title with no quotes, prefix, or punctuation decoration.",
          "Keep it under 8 words.",
          `User message: ${args.prompt}`,
        ].join("\n"),
      });

      const title = sanitizeThreadTitle(text);
      if (!title) {
        return;
      }

      await ctx.runMutation(
        internal.functions.threads.internal_setThreadTitle,
        {
          threadId: args.threadId,
          generated: true,
          title,
        },
      );
    } catch (error) {
      console.error("Failed to generate thread title", error);
    }
  },
});

export const updateThreadSettings = mutation({
  args: {
    threadId: v.string(),
    patch: v.object({
      model: v.optional(v.string()),
      tools: v.optional(
        v.object({
          search: v.optional(v.object({})),
          analysisWorkspace: v.optional(
            v.object({
              syncUploads: v.optional(v.boolean()),
            }),
          ),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();

    if (thread?.userId !== ctx.userId) {
      throw new ConvexError("Thread not found");
    }

    const mergedSettings = mergeMessageSettings(thread.settings, args.patch);

    await ctx.db.patch(thread._id, {
      settings: mergedSettings,
      updatedAt: Date.now(),
    });

    return mergedSettings;
  },
});

export const updateThreadName = mutation({
  args: {
    threadId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();

    if (thread?.userId !== ctx.userId) {
      throw new ConvexError("Thread not found");
    }

    const name = args.name.trim().slice(0, 80);
    if (!name) {
      throw new ConvexError("Thread name cannot be empty");
    }

    if (thread.name === name) {
      return { name: thread.name };
    }

    await ctx.db.patch(thread._id, {
      name,
      updatedAt: Date.now(),
    });

    return { name };
  },
});

export const deleteThread = mutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();

    if (thread?.userId !== ctx.userId) {
      throw new ConvexError("Thread not found");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();

    await Promise.all(messages.map((message) => ctx.db.delete(message._id)));
    await ctx.db.delete(thread._id);

    return { success: true };
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
