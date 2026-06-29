import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { createVertex } from "@ai-sdk/google-vertex/edge";
import { generateText } from "ai";
import { Buffer } from "buffer/";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import {
  mergePersistedMessageSettings,
  normalizeMessageSettings,
  normalizePersistedMessageSettings,
} from "@redux/types";

import type { DataModel, Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { backendEnv } from "../env";
import {
  incrementDailyAssistantApiCalls,
  updateUserUsageStats,
} from "../usageStats";
import { attachDraftAttachmentsToMessage } from "./attachments";
import { backendMutation, backendQuery, mutation, query } from "./index";
import { normalizeInstructionIdForUser } from "./instructions";
import { internalAction, internalMutation } from "./internal";

const THREAD_TITLE_GENERATION_COOLDOWN_MS = 60_000;
const THREAD_TITLE_PROMPT_MAX_LENGTH = 2_000;

async function cleanupInactiveStreamThread(
  ctx: GenericMutationCtx<DataModel>,
  thread: Doc<"threads">,
) {
  if (thread.deadMessageCheckSchedulerId) {
    await ctx.scheduler.cancel(thread.deadMessageCheckSchedulerId);
  }

  await ctx.db.patch(thread._id, {
    activeStreamId: undefined,
    activeStreamMessageId: undefined,
    activeStreamClientId: undefined,
    deadMessageCheckSchedulerId: undefined,
    status: "completed",
    updatedAt: Date.now(),
  });
}

type AuthenticatedMutationCtx = GenericMutationCtx<DataModel> & {
  userId: string;
};

type ThreadReadCtx = GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>;

const thinkingLevelValidator = v.union(
  v.literal("instant"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
);
const emptyStoredToolValidator = v.union(v.object({}), v.literal(false));
const emptyToolPatchValidator = v.union(
  v.object({}),
  v.literal(false),
  v.null(),
);

const messageSettingsValidator = v.object({
  model: v.string(),
  thinkingLevel: v.optional(thinkingLevelValidator),
  instructionId: v.optional(v.string()),
  userMessagePreviewMaxLines: v.optional(v.number()),
  tools: v.object({
    search: v.optional(emptyStoredToolValidator),
    bashWorkspace: v.optional(emptyStoredToolValidator),
    analysisWorkspace: v.optional(
      v.union(
        v.object({
          syncUploads: v.optional(v.boolean()),
        }),
        v.literal(false),
      ),
    ),
    mcpServers: v.optional(
      v.union(
        v.object({
          serverIds: v.array(v.string()),
        }),
        v.literal(false),
      ),
    ),
    imageGeneration: v.optional(
      v.union(
        v.object({
          modelId: v.string(),
        }),
        v.literal(false),
      ),
    ),
  }),
});

const messageSettingsToolPatchValidator = v.object({
  search: v.optional(emptyToolPatchValidator),
  bashWorkspace: v.optional(emptyToolPatchValidator),
  analysisWorkspace: v.optional(
    v.union(
      v.object({
        syncUploads: v.optional(v.boolean()),
      }),
      v.literal(false),
      v.null(),
    ),
  ),
  mcpServers: v.optional(
    v.union(
      v.object({
        serverIds: v.optional(v.union(v.array(v.string()), v.null())),
      }),
      v.literal(false),
      v.null(),
    ),
  ),
  imageGeneration: v.optional(
    v.union(
      v.object({
        modelId: v.optional(v.union(v.string(), v.null())),
      }),
      v.literal(false),
      v.null(),
    ),
  ),
});

async function getThreadForUser(
  ctx: AuthenticatedMutationCtx,
  threadId: string,
) {
  return getThreadForOwner(ctx, threadId, ctx.userId);
}

async function getThreadForOwner(
  ctx: ThreadReadCtx,
  threadId: string,
  userId: string,
) {
  const thread = await ctx.db
    .query("threads")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .first();

  if (thread?.userId !== userId) {
    throw new ConvexError("Thread not found");
  }

  return thread;
}

async function getMessageForThread(
  ctx: AuthenticatedMutationCtx,
  threadId: string,
  messageId: string,
) {
  return getMessageForThreadId(ctx, threadId, messageId);
}

async function getMessageForThreadId(
  ctx: ThreadReadCtx,
  threadId: string,
  messageId: string,
) {
  const message = await ctx.db
    .query("messages")
    .withIndex("by_threadId_messageId", (q) =>
      q.eq("threadId", threadId).eq("messageId", messageId),
    )
    .first();

  if (!message) {
    throw new ConvexError("Message not found");
  }

  return message;
}

async function getNextSiblingIndex(
  ctx: AuthenticatedMutationCtx,
  threadId: string,
  parentId: string | undefined,
  role: Doc<"messages">["role"],
) {
  const siblings = await ctx.db
    .query("messages")
    .withIndex("by_threadId_parentId", (q) =>
      q.eq("threadId", threadId).eq("parentId", parentId),
    )
    .collect();

  return (
    siblings
      .filter((message) => message.role === role)
      .reduce((max, message) => Math.max(max, message.siblingIndex), -1) + 1
  );
}

async function verifySignedId(signedId: string, label: string) {
  const [id, sig] = signedId.split(":");
  if (!id || !sig) {
    throw new ConvexError(`Invalid ${label}`);
  }

  const verified = await verifySignature(id, sig);
  if (!verified) {
    throw new ConvexError(`Invalid ${label} signature`);
  }

  return id;
}

async function assertThreadIdAvailable(
  ctx: AuthenticatedMutationCtx,
  threadId: string,
) {
  const existing = await ctx.db
    .query("threads")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .first();
  if (existing) {
    throw new ConvexError("Thread ID has already been used");
  }
}

async function assertMessageIdsAvailable(
  ctx: AuthenticatedMutationCtx,
  threadId: string,
  messageIds: string[],
) {
  for (const messageId of messageIds) {
    const existing = await ctx.db
      .query("messages")
      .withIndex("by_threadId_messageId", (q) =>
        q.eq("threadId", threadId).eq("messageId", messageId),
      )
      .first();

    if (existing) {
      throw new ConvexError("Message ID has already been used");
    }
  }
}

async function deleteAttachmentEmbeddings(
  ctx: GenericMutationCtx<DataModel>,
  attachmentId: string,
) {
  const rows = await ctx.db
    .query("attachmentEmbeddings")
    .withIndex("by_attachmentId", (q) => q.eq("attachmentId", attachmentId))
    .collect();

  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

async function cloneAttachedAttachmentsToMessage(
  ctx: AuthenticatedMutationCtx,
  args: {
    sourceMessageId: string;
    attachmentIds: string[];
    threadId: string;
    targetMessageId: string;
  },
) {
  const now = Date.now();

  for (const attachmentId of args.attachmentIds) {
    const attachment = await ctx.db
      .query("attachments")
      .withIndex("by_attachmentId", (q) => q.eq("attachmentId", attachmentId))
      .first();

    if (
      attachment?.userId !== ctx.userId ||
      attachment.threadId !== args.threadId ||
      attachment.messageId !== args.sourceMessageId ||
      attachment.status !== "attached"
    ) {
      throw new ConvexError("Attachment not found");
    }

    await ctx.db.insert("attachments", {
      attachmentId: crypto.randomUUID(),
      userId: attachment.userId,
      threadId: args.threadId,
      messageId: args.targetMessageId,
      chatProjectId: attachment.chatProjectId,
      status: "attached",
      projectId: attachment.projectId,
      environmentId: attachment.environmentId,
      accessKey: attachment.accessKey,
      fileKeyId: attachment.fileKeyId,
      fileId: attachment.fileId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      isPublic: attachment.isPublic,
      serveImage: attachment.serveImage,
      expiresAt: attachment.expiresAt,
      expiryStatus: attachment.expiryStatus,
      embeddingStatus: attachment.embeddingStatus,
      embeddingError: attachment.embeddingError,
      embeddingChunkCount: attachment.embeddingChunkCount,
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function attachMixedAttachmentsToMessage(
  ctx: AuthenticatedMutationCtx,
  args: {
    sourceMessageId: string;
    retainedAttachmentIds: string[];
    draftAttachmentIds: string[];
    threadId: string;
    targetMessageId: string;
  },
) {
  if (args.retainedAttachmentIds.length + args.draftAttachmentIds.length > 10) {
    throw new ConvexError("Too many attachments for one message");
  }

  if (args.retainedAttachmentIds.length > 0) {
    await cloneAttachedAttachmentsToMessage(ctx, {
      sourceMessageId: args.sourceMessageId,
      attachmentIds: args.retainedAttachmentIds,
      threadId: args.threadId,
      targetMessageId: args.targetMessageId,
    });
  }

  if (args.draftAttachmentIds.length > 0) {
    await attachDraftAttachmentsToMessage(ctx, {
      attachmentIds: args.draftAttachmentIds,
      threadId: args.threadId,
      messageId: args.targetMessageId,
    });
  }
}

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
      titleSource: thread.titleSource,
      titleGeneratedAt: thread.titleGeneratedAt,
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
      titleSource: thread.titleSource,
      titleGeneratedAt: thread.titleGeneratedAt,
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
      settings: normalizePersistedMessageSettings(thread.settings),
    };
  },
});

export const abortStream = mutation({
  args: { threadId: v.string(), messageId: v.string() },
  handler: async (ctx, args) => {
    const thread = await getThreadForOwner(ctx, args.threadId, ctx.userId);
    const message = await getMessageForThreadId(
      ctx,
      args.threadId,
      args.messageId,
    );

    await ctx.db.patch(message._id, {
      canceledAt: Date.now(),
      status: "completed", // not failed
    });
    await cleanupInactiveStreamThread(ctx, thread);

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
      throw new ConvexError("Thread not found");
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
        originalFileName?: string;
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
    userId: v.string(),
    threadId: v.string(),
    assistantMessageId: v.string(),
    parts: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const thread = await getThreadForOwner(ctx, args.threadId, args.userId);
    const assistantMessage = await getMessageForThreadId(
      ctx,
      args.threadId,
      args.assistantMessageId,
    );
    if (assistantMessage.role !== "assistant") {
      throw new ConvexError("Assistant message not found");
    }

    if (assistantMessage.status === "failed") {
      await cleanupInactiveStreamThread(ctx, thread);
      return { success: false };
    }

    if (assistantMessage.canceledAt) {
      // Save partial parts so the text generated before abort is persisted.
      if (args.parts.length > 0) {
        await ctx.db.patch(assistantMessage._id, {
          parts: args.parts as UIMessagePart<UIDataTypes, UITools>[],
        });
      }
      await cleanupInactiveStreamThread(ctx, thread);
      return { success: true };
    }

    await ctx.db.patch(assistantMessage._id, {
      parts: args.parts as UIMessagePart<UIDataTypes, UITools>[],
      status: "completed",
    });

    await cleanupInactiveStreamThread(ctx, thread);

    return { success: true };
  },
});

export const internal_failStream = backendMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    assistantMessageId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await getThreadForOwner(ctx, args.threadId, args.userId);
    // we errored
    const assistantMessage = await ctx.db
      .query("messages")
      .withIndex("by_threadId_messageId", (q) =>
        q
          .eq("threadId", args.threadId)
          .eq("messageId", args.assistantMessageId),
      )
      .first();

    if (assistantMessage?.role === "assistant") {
      await ctx.db.patch(assistantMessage._id, {
        status: "failed",
        error: args.error,
      });
    } else if (assistantMessage) {
      throw new ConvexError("Assistant message not found");
    }

    await cleanupInactiveStreamThread(ctx, thread);

    return { success: assistantMessage !== null };
  },
});

export const internal_updateMessageUsage = backendMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    usage: v.object({
      promptTokens: v.number(),
      responseTokens: v.number(),
      totalTokens: v.number(),
    }),
    generationStats: v.optional(
      v.object({
        reasoningDurationMs: v.optional(v.number()),
        timeToFirstTokenMs: v.number(),
        totalDurationMs: v.number(),
        tokensPerSecond: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await getThreadForOwner(ctx, args.threadId, args.userId);
    const message = await getMessageForThreadId(
      ctx,
      args.threadId,
      args.messageId,
    );
    if (message.role !== "assistant") {
      throw new ConvexError("Assistant message not found");
    }
    if (message.usage === undefined) {
      await incrementDailyAssistantApiCalls(ctx, args.userId);
      await updateUserUsageStats(ctx, args.userId, {
        lastActiveAt: Date.now(),
      });
    }
    await ctx.db.patch(message._id, {
      usage: args.usage,
      generationStats: args.generationStats,
    });
  },
});

export const internal_updateBashFsState = backendMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    bashFsState: v.optional(
      v.object({
        accessKey: v.string(),
        fileKeyId: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const thread = await getThreadForOwner(ctx, args.threadId, args.userId);
    await ctx.db.patch(thread._id, { bashFsState: args.bashFsState });
  },
});

// Set the active stream ID for resumable streams
export const internal_setActiveStreamId = backendMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    streamId: v.string(),
    messageId: v.string(),
    clientId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const thread = await getThreadForOwner(ctx, args.threadId, args.userId);
    const message = await getMessageForThreadId(
      ctx,
      args.threadId,
      args.messageId,
    );
    if (message.role !== "assistant") {
      throw new ConvexError("Assistant message not found");
    }

    await ctx.db.patch(thread._id, {
      activeStreamId: args.streamId,
      activeStreamMessageId: args.messageId,
      activeStreamClientId: args.clientId,
    });
    return { success: true };
  },
});

export const internal_checkMessageAbort = backendQuery({
  args: { userId: v.string(), messageId: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    await getThreadForOwner(ctx, args.threadId, args.userId);
    const message = await ctx.db
      .query("messages")
      .withIndex("by_threadId_messageId", (q) =>
        q.eq("threadId", args.threadId).eq("messageId", args.messageId),
      )
      .first();

    if (!message) {
      throw new ConvexError("Message not found");
    }
    return message.canceledAt;
  },
});

export const internal_validateGenerationMessage = backendQuery({
  args: { userId: v.string(), messageId: v.string(), threadId: v.string() },
  handler: async (ctx, args) => {
    await getThreadForOwner(ctx, args.threadId, args.userId);
    const message = await getMessageForThreadId(
      ctx,
      args.threadId,
      args.messageId,
    );
    if (message.role !== "assistant" || message.status !== "generating") {
      throw new ConvexError("Assistant message is not ready for generation");
    }
    return { ok: true as const };
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
    settings: messageSettingsValidator,
    parentMessageId: v.optional(v.string()),
    attachmentIds: v.optional(v.array(v.string())),
    chatProjectId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Decode & verify userMessageId
    const userMsgId = await verifySignedId(args.userMessageId, "userMessageId");

    // 2. Decode & verify assistantMessageId
    const assistantMsgId = await verifySignedId(
      args.assistantMessageId,
      "assistantMessageId",
    );

    let threadId = args.threadId;
    let createdNewThread = false;
    let threadDbId: Id<"threads">;
    let parentId: string | undefined = undefined;
    let depth = 0;
    let siblingIndex = 0;
    const normalizedSettings = normalizeMessageSettings(args.settings);
    normalizedSettings.instructionId = await normalizeInstructionIdForUser(
      ctx,
      ctx.userId,
      normalizedSettings.instructionId,
    );

    // 3. Insert thread if needed
    if (threadId.includes(":")) {
      // is a new thread
      threadId = await verifySignedId(threadId, "threadId");
      await assertThreadIdAvailable(ctx, threadId);

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

      threadDbId = await ctx.db.insert("threads", {
        threadId,
        userId: ctx.userId,
        name: "New Thread",
        status: "generating",
        updatedAt: Date.now(),
        titleGenerationRequestedAt: Date.now(),
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

      threadDbId = thread._id;
      if (args.parentMessageId) {
        const parentMessage = await getMessageForThread(
          ctx,
          thread.threadId,
          args.parentMessageId,
        );
        parentId = parentMessage.messageId;
        depth = parentMessage.depth + 1;
      }
      siblingIndex = await getNextSiblingIndex(
        ctx,
        thread.threadId,
        parentId,
        "user",
      );

      if (thread.deadMessageCheckSchedulerId) {
        await ctx.scheduler.cancel(thread.deadMessageCheckSchedulerId);
      }

      // Update thread status
      await ctx.db.patch(thread._id, {
        status: "generating",
        updatedAt: Date.now(),
        selectedLeafMessageId: assistantMsgId,
        activeStreamId: undefined,
        activeStreamMessageId: undefined,
        activeStreamClientId: undefined,
        deadMessageCheckSchedulerId: undefined,
      });
    }
    await assertMessageIdsAvailable(ctx, threadId, [userMsgId, assistantMsgId]);

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
    await updateUserUsageStats(ctx, ctx.userId, {
      userMessagesDelta: 1,
      threadsDelta: createdNewThread ? 1 : 0,
      lastActiveAt: Date.now(),
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
      depth: depth + 1,
      siblingIndex: 0,
      mutation: { type: "original" },
      model: args.model,
      thinkingLevel: normalizedSettings.thinkingLevel,
    });

    const deadMessageCheckSchedulerId = await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.functions.threads.internal_checkMessageDead,
      {
        threadId,
        messageId: assistantMsgId,
      },
    );

    await ctx.db.patch(threadDbId, {
      deadMessageCheckSchedulerId,
      selectedLeafMessageId: assistantMsgId,
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
          prompt: userPrompt.slice(0, THREAD_TITLE_PROMPT_MAX_LENGTH),
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

export const editUserMessageBranch = mutation({
  args: {
    threadId: v.string(),
    fromMessageId: v.string(),
    userMessage: sendMessageSchema,
    userMessageId: v.string(),
    assistantMessageId: v.string(),
    model: v.string(),
    settings: messageSettingsValidator,
    retainedAttachmentIds: v.optional(v.array(v.string())),
    draftAttachmentIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const thread = await getThreadForUser(ctx, args.threadId);
    const sourceMessage = await getMessageForThread(
      ctx,
      args.threadId,
      args.fromMessageId,
    );

    if (sourceMessage.role !== "user") {
      throw new ConvexError("Only user messages can be edited");
    }

    const normalizedSettings = normalizeMessageSettings(args.settings);

    const userMsgId = await verifySignedId(args.userMessageId, "userMessageId");
    const assistantMsgId = await verifySignedId(
      args.assistantMessageId,
      "assistantMessageId",
    );
    await assertMessageIdsAvailable(ctx, args.threadId, [
      userMsgId,
      assistantMsgId,
    ]);

    if (thread.deadMessageCheckSchedulerId) {
      await ctx.scheduler.cancel(thread.deadMessageCheckSchedulerId);
    }

    const userSiblingIndex = await getNextSiblingIndex(
      ctx,
      args.threadId,
      sourceMessage.parentId,
      "user",
    );

    await ctx.db.insert("messages", {
      threadId: args.threadId,
      messageId: userMsgId,
      parentId: sourceMessage.parentId,
      role: "user",
      parts: args.userMessage.parts as UIMessagePart<UIDataTypes, UITools>[],
      status: "completed",
      depth: sourceMessage.depth,
      siblingIndex: userSiblingIndex,
      mutation: { type: "edit", fromMessageId: sourceMessage.messageId },
    });
    await updateUserUsageStats(ctx, ctx.userId, {
      userMessagesDelta: 1,
      lastActiveAt: Date.now(),
    });

    await attachMixedAttachmentsToMessage(ctx, {
      sourceMessageId: sourceMessage.messageId,
      retainedAttachmentIds: args.retainedAttachmentIds ?? [],
      draftAttachmentIds: args.draftAttachmentIds ?? [],
      threadId: args.threadId,
      targetMessageId: userMsgId,
    });

    await ctx.db.insert("messages", {
      threadId: args.threadId,
      messageId: assistantMsgId,
      parentId: userMsgId,
      role: "assistant",
      parts: [],
      status: "generating",
      depth: sourceMessage.depth + 1,
      siblingIndex: 0,
      mutation: { type: "original" },
      model: args.model,
      thinkingLevel: normalizedSettings.thinkingLevel,
    });

    const deadMessageCheckSchedulerId = await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.functions.threads.internal_checkMessageDead,
      {
        threadId: args.threadId,
        messageId: assistantMsgId,
      },
    );

    await ctx.db.patch(thread._id, {
      status: "generating",
      updatedAt: Date.now(),
      selectedLeafMessageId: assistantMsgId,
      activeStreamId: undefined,
      activeStreamMessageId: undefined,
      activeStreamClientId: undefined,
      deadMessageCheckSchedulerId,
    });

    return {
      threadId: args.threadId,
      userMessageId: userMsgId,
      assistantMessageId: assistantMsgId,
    };
  },
});

export const regenerateAssistantMessageBranch = mutation({
  args: {
    threadId: v.string(),
    fromMessageId: v.string(),
    assistantMessageId: v.string(),
    model: v.string(),
    settings: messageSettingsValidator,
  },
  handler: async (ctx, args) => {
    const thread = await getThreadForUser(ctx, args.threadId);
    const sourceMessage = await getMessageForThread(
      ctx,
      args.threadId,
      args.fromMessageId,
    );

    if (sourceMessage.role !== "assistant") {
      throw new ConvexError("Only assistant messages can be regenerated");
    }

    const normalizedSettings = normalizeMessageSettings(args.settings);

    const assistantMsgId = await verifySignedId(
      args.assistantMessageId,
      "assistantMessageId",
    );
    await assertMessageIdsAvailable(ctx, args.threadId, [assistantMsgId]);

    if (thread.deadMessageCheckSchedulerId) {
      await ctx.scheduler.cancel(thread.deadMessageCheckSchedulerId);
    }

    const assistantSiblingIndex = await getNextSiblingIndex(
      ctx,
      args.threadId,
      sourceMessage.parentId,
      "assistant",
    );

    await ctx.db.insert("messages", {
      threadId: args.threadId,
      messageId: assistantMsgId,
      parentId: sourceMessage.parentId,
      role: "assistant",
      parts: [],
      status: "generating",
      depth: sourceMessage.depth,
      siblingIndex: assistantSiblingIndex,
      mutation: {
        type: "regeneration",
        fromMessageId: sourceMessage.messageId,
      },
      model: args.model,
      thinkingLevel: normalizedSettings.thinkingLevel,
    });

    const deadMessageCheckSchedulerId = await ctx.scheduler.runAfter(
      10 * 60 * 1000,
      internal.functions.threads.internal_checkMessageDead,
      {
        threadId: args.threadId,
        messageId: assistantMsgId,
      },
    );

    await ctx.db.patch(thread._id, {
      status: "generating",
      updatedAt: Date.now(),
      selectedLeafMessageId: assistantMsgId,
      activeStreamId: undefined,
      activeStreamMessageId: undefined,
      activeStreamClientId: undefined,
      deadMessageCheckSchedulerId,
    });

    return {
      threadId: args.threadId,
      assistantMessageId: assistantMsgId,
    };
  },
});

export const selectThreadBranch = mutation({
  args: {
    threadId: v.string(),
    leafMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await getThreadForUser(ctx, args.threadId);
    const selectedMessage = await getMessageForThread(
      ctx,
      args.threadId,
      args.leafMessageId,
    );
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();

    const childrenByParent = new Map<string, Doc<"messages">[]>();
    for (const message of messages) {
      if (!message.parentId) {
        continue;
      }

      const existing = childrenByParent.get(message.parentId) ?? [];
      existing.push(message);
      childrenByParent.set(message.parentId, existing);
    }

    let deepest = selectedMessage;
    const stack = [...(childrenByParent.get(selectedMessage.messageId) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop();
      if (!next) {
        continue;
      }

      if (
        next.depth > deepest.depth ||
        (next.depth === deepest.depth &&
          next._creationTime > deepest._creationTime)
      ) {
        deepest = next;
      }
      stack.push(...(childrenByParent.get(next.messageId) ?? []));
    }

    await ctx.db.patch(thread._id, {
      selectedLeafMessageId: deepest.messageId,
      updatedAt: Date.now(),
    });

    return { selectedLeafMessageId: deepest.messageId };
  },
});

export const internal_checkMessageDead = internalMutation({
  args: {
    threadId: v.string(),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();
    if (!thread || thread.status === "completed") return true;

    const message = await ctx.db
      .query("messages")
      .withIndex("by_threadId_messageId", (q) =>
        q.eq("threadId", args.threadId).eq("messageId", args.messageId),
      )
      .first();
    if (!message || message.canceledAt || message.status !== "generating") {
      return true;
    }

    await ctx.db.patch(message._id, {
      status: "failed",
      error: "Stream timed out",
    });

    await cleanupInactiveStreamThread(ctx, thread);

    return true;
  },
});

export const internal_setThreadTitle = internalMutation({
  args: {
    threadId: v.string(),
    generated: v.boolean(),
    title: v.string(),
    /** When true, replace the stored name even if it was already customized. */
    forceOverwrite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();

    if (!thread) {
      return;
    }

    const userChosenTitleLocked =
      !args.forceOverwrite &&
      args.generated &&
      (thread.titleSource === "user" ||
        (thread.titleSource === undefined && thread.name !== "New Thread"));

    if (userChosenTitleLocked) {
      return;
    }

    const now = Date.now();
    await ctx.db.patch(thread._id, {
      name: args.title,
      // updatedAt: now,
      titleSource: "generated",
      titleGeneratedAt: now,
      titleGenerationRequestedAt: undefined,
    });
  },
});

export const internal_generateThreadTitle = internalAction({
  args: {
    threadId: v.string(),
    prompt: v.string(),
    forceOverwrite: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const env = backendEnv();

    const vertex = createVertex({
      apiKey: env.GOOGLE_VERTEX_API_KEY,
    });

    try {
      const { text } = await generateText({
        model: vertex("gemini-3-flash-preview"),
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
          forceOverwrite: args.forceOverwrite,
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
      instructionId: v.optional(v.string()),
      clearInstructionId: v.optional(v.boolean()),
      model: v.optional(v.string()),
      thinkingLevel: v.optional(thinkingLevelValidator),
      tools: v.optional(v.union(messageSettingsToolPatchValidator, v.null())),
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

    const { clearInstructionId, ...settingsPatch } = args.patch;
    const mergedSettings = mergePersistedMessageSettings(
      thread.settings,
      settingsPatch,
    );
    mergedSettings.instructionId = await normalizeInstructionIdForUser(
      ctx,
      ctx.userId,
      clearInstructionId ? undefined : mergedSettings.instructionId,
    );

    await ctx.db.patch(thread._id, {
      settings: mergedSettings,
      updatedAt: Date.now(),
    });

    return mergedSettings;
  },
});

export const regenerateThreadTitle = mutation({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .first();

    if (thread?.userId !== ctx.userId) {
      throw new ConvexError("Thread not found");
    }
    const now = Date.now();
    if (
      thread.titleGenerationRequestedAt !== undefined &&
      now - thread.titleGenerationRequestedAt <
        THREAD_TITLE_GENERATION_COOLDOWN_MS
    ) {
      throw new ConvexError("Thread title generation is already in progress");
    }
    if (
      thread.titleGeneratedAt !== undefined &&
      now - thread.titleGeneratedAt < THREAD_TITLE_GENERATION_COOLDOWN_MS
    ) {
      throw new ConvexError("Thread title was regenerated recently");
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();

    const userMessages = messages.filter((m) => m.role === "user");
    userMessages.sort((a, b) => {
      const t = a._creationTime - b._creationTime;
      return t !== 0 ? t : a.messageId.localeCompare(b.messageId);
    });

    const firstUserMessage = userMessages[0];

    const prompt =
      firstUserMessage &&
      extractUserPrompt(
        firstUserMessage.parts as UIMessagePart<UIDataTypes, UITools>[],
      );

    if (!prompt) {
      throw new ConvexError("No message text found to generate a title from");
    }

    await ctx.db.patch(thread._id, {
      titleGenerationRequestedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.functions.threads.internal_generateThreadTitle,
      {
        threadId: args.threadId,
        prompt: prompt.slice(0, THREAD_TITLE_PROMPT_MAX_LENGTH),
        forceOverwrite: true,
      },
    );

    return { scheduled: true as const };
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
      titleSource: "user",
      titleGeneratedAt: undefined,
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

    const userMessageCount = messages.filter(
      (message) => message.role === "user",
    ).length;
    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();
    const generatedImages = await ctx.db
      .query("generatedImages")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();
    const modelGeneratedFiles = await ctx.db
      .query("modelGeneratedFiles")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .collect();
    const uniqueFiles = new Map<
      string,
      {
        projectId: string;
        environmentId: string;
        fileKeyId: string;
        accessKey: string;
        size: number;
      }
    >();
    const unreferencedFiles: {
      projectId: string;
      environmentId: string;
      fileKeyId: string;
      accessKey: string;
      size: number;
    }[] = [];

    for (const attachment of attachments) {
      uniqueFiles.set(attachment.fileKeyId, {
        projectId: attachment.projectId,
        environmentId: attachment.environmentId,
        fileKeyId: attachment.fileKeyId,
        accessKey: attachment.accessKey,
        size: attachment.size,
      });
      await deleteAttachmentEmbeddings(ctx, attachment.attachmentId);
      await ctx.db.delete(attachment._id);
    }

    for (const generatedImage of generatedImages) {
      uniqueFiles.set(generatedImage.fileKeyId, {
        projectId: generatedImage.projectId,
        environmentId: generatedImage.environmentId,
        fileKeyId: generatedImage.fileKeyId,
        accessKey: generatedImage.accessKey,
        size: generatedImage.size,
      });
      await ctx.db.delete(generatedImage._id);
    }

    for (const modelGeneratedFile of modelGeneratedFiles) {
      uniqueFiles.set(modelGeneratedFile.fileKeyId, {
        projectId: modelGeneratedFile.projectId,
        environmentId: modelGeneratedFile.environmentId,
        fileKeyId: modelGeneratedFile.fileKeyId,
        accessKey: modelGeneratedFile.accessKey,
        size: modelGeneratedFile.size,
      });
      await ctx.db.delete(modelGeneratedFile._id);
    }

    for (const file of uniqueFiles.values()) {
      const remainingRefs = await ctx.db
        .query("attachments")
        .withIndex("by_fileKeyId", (q) => q.eq("fileKeyId", file.fileKeyId))
        .first();
      const remainingGeneratedImageRefs = await ctx.db
        .query("generatedImages")
        .withIndex("by_fileKeyId", (q) => q.eq("fileKeyId", file.fileKeyId))
        .first();
      const remainingModelGeneratedFileRefs = await ctx.db
        .query("modelGeneratedFiles")
        .withIndex("by_fileKeyId", (q) => q.eq("fileKeyId", file.fileKeyId))
        .first();
      if (
        remainingRefs ||
        remainingGeneratedImageRefs ||
        remainingModelGeneratedFileRefs
      ) {
        continue;
      }

      unreferencedFiles.push(file);
      await ctx.scheduler.runAfter(
        0,
        internal.functions.attachments.internal_deleteFileFromSilo,
        {
          projectId: file.projectId,
          environmentId: file.environmentId,
          fileKeyId: file.fileKeyId,
          accessKey: file.accessKey,
        },
      );
    }

    await Promise.all(messages.map((message) => ctx.db.delete(message._id)));
    await ctx.db.delete(thread._id);
    await updateUserUsageStats(ctx, ctx.userId, {
      threadsDelta: -1,
      userMessagesDelta: -userMessageCount,
      attachmentsDelta: -unreferencedFiles.length,
      storageBytesDelta: -unreferencedFiles.reduce(
        (total, file) => total + file.size,
        0,
      ),
      lastActiveAt: Date.now(),
    });

    return { success: true };
  },
});

export const getThreadStreamId = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
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
      messageId: thread.activeStreamMessageId,
      clientId: thread.activeStreamClientId,
    };
  },
});
