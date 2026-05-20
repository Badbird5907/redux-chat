import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { DataModel, Doc } from "../_generated/dataModel";
import { updateUserUsageStats } from "../usageStats";
import { mutation, publicMutation, publicQuery, query } from "./index";
import { verifySignature } from "./threads";

const MAX_SHARES_PER_THREAD = 5;

const shareSettingsValidator = v.object({
  onlyCurrentBranch: v.boolean(),
  includeAttachments: v.boolean(),
  autoUpdate: v.boolean(),
});

type ShareSettings = {
  onlyCurrentBranch: boolean;
  includeAttachments: boolean;
  autoUpdate: boolean;
};

type ThreadMessage = Doc<"messages">;
type ThreadReadCtx = GenericQueryCtx<DataModel> | GenericMutationCtx<DataModel>;

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

async function getOwnedThread(
  ctx: ThreadReadCtx & { userId: string },
  threadId: string,
) {
  const thread = await ctx.db
    .query("threads")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .first();

  if (thread?.userId !== ctx.userId) {
    throw new ConvexError("Thread not found");
  }

  return thread;
}

async function getShare(ctx: ThreadReadCtx, shareId: string) {
  const share = await ctx.db
    .query("threadShares")
    .withIndex("by_shareId", (q) => q.eq("shareId", shareId))
    .first();

  if (!share) {
    throw new ConvexError("Share not found");
  }

  return share;
}

async function getOwnedShare(
  ctx: ThreadReadCtx & { userId: string },
  shareId: string,
) {
  const share = await getShare(ctx, shareId);

  if (share.userId !== ctx.userId) {
    throw new ConvexError("Share not found");
  }

  return share;
}

async function getThreadMessages(ctx: ThreadReadCtx, threadId: string) {
  return await ctx.db
    .query("messages")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .collect();
}

function messageOrderValue(message: ThreadMessage) {
  return message._creationTime;
}

function sortMessagesForBranching(messages: ThreadMessage[]) {
  return [...messages].sort((left, right) => {
    const depthDelta = left.depth - right.depth;
    if (depthDelta !== 0) return depthDelta;

    const siblingDelta = left.siblingIndex - right.siblingIndex;
    if (siblingDelta !== 0) return siblingDelta;

    const timeDelta = messageOrderValue(left) - messageOrderValue(right);
    if (timeDelta !== 0) return timeDelta;

    return left.messageId.localeCompare(right.messageId);
  });
}

function getMessageMap(messages: ThreadMessage[]) {
  return new Map(messages.map((message) => [message.messageId, message]));
}

function getChildrenByParent(messages: ThreadMessage[]) {
  const childrenByParent = new Map<string, ThreadMessage[]>();

  for (const message of sortMessagesForBranching(messages)) {
    if (!message.parentId) continue;

    const existing = childrenByParent.get(message.parentId) ?? [];
    existing.push(message);
    childrenByParent.set(message.parentId, existing);
  }

  return childrenByParent;
}

function resolveSelectedLeaf(
  messages: ThreadMessage[],
  selectedLeafMessageId: string | undefined,
) {
  const messageMap = getMessageMap(messages);
  if (selectedLeafMessageId && messageMap.has(selectedLeafMessageId)) {
    return selectedLeafMessageId;
  }

  const sorted = sortMessagesForBranching(messages);
  const childrenByParent = getChildrenByParent(sorted);
  const leaves = sorted.filter(
    (message) => !childrenByParent.has(message.messageId),
  );
  const fallback = leaves.at(-1) ?? sorted.at(-1);

  return fallback?.messageId;
}

function getVisibleBranchMessageIds(
  messages: ThreadMessage[],
  selectedLeafMessageId: string | undefined,
) {
  const messageMap = getMessageMap(messages);
  const resolvedLeaf = resolveSelectedLeaf(messages, selectedLeafMessageId);
  if (!resolvedLeaf) return [];

  const path: string[] = [];
  let current = messageMap.get(resolvedLeaf);

  while (current) {
    path.push(current.messageId);
    current = current.parentId ? messageMap.get(current.parentId) : undefined;
  }

  return path.reverse();
}

function getDeepestLeafForBranch(
  messages: ThreadMessage[],
  branchRootMessageId: string,
) {
  const messageMap = getMessageMap(messages);
  const root = messageMap.get(branchRootMessageId);
  if (!root) return undefined;

  const childrenByParent = getChildrenByParent(messages);
  let deepest = root;
  const stack = [...(childrenByParent.get(root.messageId) ?? [])];

  while (stack.length > 0) {
    const message = stack.pop();
    if (!message) continue;

    if (
      message.depth > deepest.depth ||
      (message.depth === deepest.depth &&
        messageOrderValue(message) > messageOrderValue(deepest))
    ) {
      deepest = message;
    }

    stack.push(...(childrenByParent.get(message.messageId) ?? []));
  }

  return deepest.messageId;
}

function getSharedMessageIds(args: {
  messages: ThreadMessage[];
  selectedLeafMessageId?: string;
  settings: ShareSettings;
}) {
  if (!args.settings.onlyCurrentBranch) {
    return sortMessagesForBranching(args.messages).map(
      (message) => message.messageId,
    );
  }

  return getVisibleBranchMessageIds(args.messages, args.selectedLeafMessageId);
}

function getTextPreview(parts: unknown[]) {
  const text = parts
    .map((part) => {
      if (
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= 80) {
    return text;
  }

  return `${text.slice(0, 77)}...`;
}

async function getLockedBranchPreview(
  ctx: ThreadReadCtx,
  share: Doc<"threadShares">,
) {
  if (!share.settings.onlyCurrentBranch) {
    return undefined;
  }

  const messageId = share.settings.autoUpdate
    ? share.anchorLeafMessageId
    : share.snapshotSelectedLeafMessageId;
  if (!messageId) {
    return undefined;
  }

  const message = await ctx.db
    .query("messages")
    .withIndex("by_threadId_messageId", (q) =>
      q.eq("threadId", share.threadId).eq("messageId", messageId),
    )
    .first();

  if (!message) {
    return undefined;
  }

  const preview = getTextPreview(message.parts);

  return {
    messageId,
    preview: preview || `${message.role} message`,
  };
}

async function buildSnapshot(
  ctx: ThreadReadCtx,
  thread: Doc<"threads">,
  settings: ShareSettings,
  leafMessageId?: string,
) {
  const messages = await getThreadMessages(ctx, thread.threadId);
  const selectedLeafMessageId = resolveSelectedLeaf(
    messages,
    leafMessageId ?? thread.selectedLeafMessageId,
  );

  return {
    anchorLeafMessageId: settings.onlyCurrentBranch
      ? selectedLeafMessageId
      : undefined,
    snapshotMessageIds: settings.autoUpdate
      ? undefined
      : getSharedMessageIds({
          messages,
          selectedLeafMessageId,
          settings,
        }),
    snapshotSelectedLeafMessageId: settings.autoUpdate
      ? undefined
      : selectedLeafMessageId,
  };
}

async function buildPublicSharePayload(ctx: ThreadReadCtx, shareId: string) {
  const share = await getShare(ctx, shareId);
  const thread = await ctx.db
    .query("threads")
    .withIndex("by_threadId", (q) => q.eq("threadId", share.threadId))
    .first();

  if (thread?.userId !== share.userId) {
    throw new ConvexError("Share not found");
  }

  const allMessages = await getThreadMessages(ctx, share.threadId);
  let selectedLeafMessageId = thread.selectedLeafMessageId;
  let sharedMessageIds: string[];

  if (!share.settings.autoUpdate) {
    sharedMessageIds = share.snapshotMessageIds ?? [];
    selectedLeafMessageId = share.snapshotSelectedLeafMessageId;
  } else if (share.settings.onlyCurrentBranch) {
    const anchorLeafMessageId =
      share.anchorLeafMessageId ??
      resolveSelectedLeaf(allMessages, thread.selectedLeafMessageId);
    const deepestLeafMessageId = anchorLeafMessageId
      ? getDeepestLeafForBranch(allMessages, anchorLeafMessageId)
      : undefined;
    selectedLeafMessageId = deepestLeafMessageId ?? anchorLeafMessageId;
    sharedMessageIds = getVisibleBranchMessageIds(
      allMessages,
      selectedLeafMessageId,
    );
  } else {
    selectedLeafMessageId = resolveSelectedLeaf(
      allMessages,
      thread.selectedLeafMessageId,
    );
    sharedMessageIds = getSharedMessageIds({
      messages: allMessages,
      selectedLeafMessageId,
      settings: share.settings,
    });
  }

  const sharedMessageIdSet = new Set(sharedMessageIds);
  const messages = sortMessagesForBranching(allMessages).filter((message) =>
    sharedMessageIdSet.has(message.messageId),
  );

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

  if (share.settings.includeAttachments && messages.length > 0) {
    const attachments = await ctx.db
      .query("attachments")
      .withIndex("by_threadId", (q) => q.eq("threadId", share.threadId))
      .collect();

    for (const attachment of attachments) {
      if (
        !attachment.messageId ||
        !sharedMessageIdSet.has(attachment.messageId)
      ) {
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
  }

  return {
    share: {
      shareId: share.shareId,
      settings: share.settings,
      viewCount: share.viewCount,
      forkCount: share.forkCount,
      createdAt: share.createdAt,
      updatedAt: share.updatedAt,
    },
    thread: {
      name: thread.name,
      selectedLeafMessageId,
      settingsJson: JSON.stringify(thread.settings),
    },
    messages: messages.map((message) => ({
      ...message,
      id: message.messageId,
      attachments: attachmentsByMessageId.get(message.messageId) ?? [],
    })),
  };
}

function isBotUserAgent(userAgent: string | undefined) {
  if (!userAgent) return false;

  return /bot|crawl|spider|slurp|facebookexternalhit|discordbot|twitterbot|linkedinbot|preview|embedly|quora link preview|headless/i.test(
    userAgent,
  );
}

export const listForThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    await getOwnedThread(ctx, args.threadId);

    const shares = await ctx.db
      .query("threadShares")
      .withIndex("by_userId_threadId", (q) =>
        q.eq("userId", ctx.userId).eq("threadId", args.threadId),
      )
      .collect();

    return await Promise.all(
      shares.map(async (share) => ({
        ...share,
        lockedBranch: await getLockedBranchPreview(ctx, share),
      })),
    );
  },
});

export const create = mutation({
  args: {
    threadId: v.string(),
    settings: shareSettingsValidator,
  },
  handler: async (ctx, args) => {
    const thread = await getOwnedThread(ctx, args.threadId);
    const existingShares = await ctx.db
      .query("threadShares")
      .withIndex("by_userId_threadId", (q) =>
        q.eq("userId", ctx.userId).eq("threadId", args.threadId),
      )
      .collect();

    if (existingShares.length >= MAX_SHARES_PER_THREAD) {
      throw new ConvexError("A thread can have at most 5 share links");
    }

    const now = Date.now();
    const snapshot = await buildSnapshot(ctx, thread, args.settings);
    const shareId = crypto.randomUUID();

    await ctx.db.insert("threadShares", {
      shareId,
      threadId: args.threadId,
      userId: ctx.userId,
      settings: args.settings,
      ...snapshot,
      viewCount: 0,
      forkCount: 0,
      createdAt: now,
      updatedAt: now,
    });

    return { shareId };
  },
});

export const update = mutation({
  args: {
    shareId: v.string(),
    settings: shareSettingsValidator,
  },
  handler: async (ctx, args) => {
    const share = await getOwnedShare(ctx, args.shareId);
    const thread = await getOwnedThread(ctx, share.threadId);
    const shouldRecomputeBranchState =
      share.settings.onlyCurrentBranch !== args.settings.onlyCurrentBranch ||
      share.settings.autoUpdate !== args.settings.autoUpdate;
    const snapshot = shouldRecomputeBranchState
      ? await buildSnapshot(ctx, thread, args.settings)
      : {};

    await ctx.db.patch(share._id, {
      settings: args.settings,
      ...snapshot,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateSelectedBranch = mutation({
  args: { shareId: v.string() },
  handler: async (ctx, args) => {
    const share = await getOwnedShare(ctx, args.shareId);
    if (!share.settings.onlyCurrentBranch) {
      throw new ConvexError("Share is configured to include all branches");
    }

    const thread = await getOwnedThread(ctx, share.threadId);
    const snapshot = await buildSnapshot(ctx, thread, share.settings);

    await ctx.db.patch(share._id, {
      ...snapshot,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const updateSelectedBranchToLeaf = mutation({
  args: {
    shareId: v.string(),
    leafMessageId: v.string(),
  },
  handler: async (ctx, args) => {
    const share = await getOwnedShare(ctx, args.shareId);
    if (!share.settings.onlyCurrentBranch) {
      throw new ConvexError("Share is configured to include all branches");
    }

    const thread = await getOwnedThread(ctx, share.threadId);
    const message = await ctx.db
      .query("messages")
      .withIndex("by_threadId_messageId", (q) =>
        q.eq("threadId", thread.threadId).eq("messageId", args.leafMessageId),
      )
      .first();

    if (!message) {
      throw new ConvexError("Message not found");
    }

    const snapshot = await buildSnapshot(
      ctx,
      thread,
      share.settings,
      args.leafMessageId,
    );

    await ctx.db.patch(share._id, {
      ...snapshot,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const remove = mutation({
  args: { shareId: v.string() },
  handler: async (ctx, args) => {
    const share = await getOwnedShare(ctx, args.shareId);
    await ctx.db.delete(share._id);
    return { success: true };
  },
});

export const getPublicShare = publicQuery({
  args: { shareId: v.string() },
  handler: async (ctx, args) => {
    return await buildPublicSharePayload(ctx, args.shareId);
  },
});

export const recordView = publicMutation({
  args: {
    shareId: v.string(),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (isBotUserAgent(args.userAgent)) {
      return { counted: false };
    }

    const share = await getShare(ctx, args.shareId);
    await ctx.db.patch(share._id, {
      viewCount: share.viewCount + 1,
      updatedAt: Date.now(),
    });

    return { counted: true };
  },
});

export const listPublicShareAttachments = publicQuery({
  args: {
    shareId: v.string(),
    attachmentIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.attachmentIds.length === 0) {
      return [];
    }

    const payload = await buildPublicSharePayload(ctx, args.shareId);
    if (!payload.share.settings.includeAttachments) {
      return [];
    }

    const allowedAttachmentIds = new Set(
      payload.messages.flatMap((message) =>
        message.attachments.map((attachment) => attachment.attachmentId),
      ),
    );
    const now = Date.now();
    const attachments = await Promise.all(
      args.attachmentIds.map(async (attachmentId) => {
        if (!allowedAttachmentIds.has(attachmentId)) {
          return null;
        }

        const attachment = await ctx.db
          .query("attachments")
          .withIndex("by_attachmentId", (q) =>
            q.eq("attachmentId", attachmentId),
          )
          .first();

        if (!attachment) {
          return null;
        }

        return {
          attachmentId: attachment.attachmentId,
          threadId: attachment.threadId,
          messageId: attachment.messageId,
          status: attachment.status,
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
          expired:
            attachment.expiresAt !== undefined && attachment.expiresAt <= now,
        };
      }),
    );

    return attachments.filter((attachment) => attachment !== null);
  },
});

export const fork = mutation({
  args: {
    shareId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const targetThreadId = await verifySignedId(args.threadId, "threadId");
    const existingThread = await ctx.db
      .query("threads")
      .withIndex("by_threadId", (q) => q.eq("threadId", targetThreadId))
      .first();
    if (existingThread) {
      throw new ConvexError("Thread ID has already been used");
    }

    const payload = await buildPublicSharePayload(ctx, args.shareId);
    const sourceShare = await getShare(ctx, args.shareId);
    const now = Date.now();

    await ctx.db.insert("threads", {
      threadId: targetThreadId,
      userId: ctx.userId,
      name: payload.thread.name,
      status: "completed",
      settings: JSON.parse(
        payload.thread.settingsJson,
      ) as Doc<"threads">["settings"],
      selectedLeafMessageId: payload.thread.selectedLeafMessageId,
      updatedAt: now,
    });

    for (const message of payload.messages) {
      await ctx.db.insert("messages", {
        threadId: targetThreadId,
        messageId: message.messageId,
        parentId: message.parentId,
        role: message.role,
        parts: message.parts,
        status: message.status,
        depth: message.depth,
        siblingIndex: message.siblingIndex,
        mutation: message.mutation,
        model: message.model,
        canceledAt: message.canceledAt,
        usage: message.usage,
        generationStats: message.generationStats,
        error: message.error,
        thinkingLevel: message.thinkingLevel,
      });
    }

    if (payload.share.settings.includeAttachments) {
      for (const message of payload.messages) {
        for (const attachmentSummary of message.attachments) {
          const attachment = await ctx.db
            .query("attachments")
            .withIndex("by_attachmentId", (q) =>
              q.eq("attachmentId", attachmentSummary.attachmentId),
            )
            .first();

          if (!attachment) continue;

          await ctx.db.insert("attachments", {
            attachmentId: crypto.randomUUID(),
            userId: ctx.userId,
            threadId: targetThreadId,
            messageId: message.messageId,
            chatProjectId: undefined,
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
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    await ctx.db.patch(sourceShare._id, {
      forkCount: sourceShare.forkCount + 1,
      updatedAt: now,
    });
    await updateUserUsageStats(ctx, ctx.userId, {
      threadsDelta: 1,
      userMessagesDelta: payload.messages.filter(
        (message) => message.role === "user",
      ).length,
      attachmentsDelta: payload.share.settings.includeAttachments
        ? payload.messages.reduce(
            (count, message) => count + message.attachments.length,
            0,
          )
        : 0,
      storageBytesDelta: 0,
      lastActiveAt: now,
    });

    return { threadId: targetThreadId };
  },
});
