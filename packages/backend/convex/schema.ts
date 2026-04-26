import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const messageStatus = v.union(
  v.literal("generating"),
  v.literal("completed"),
  v.literal("failed")
);

// primarily controls the ui sidebar
const threadStatus = v.union(v.literal("generating"), v.literal("completed"));

const messageRole = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system")
);

const mutationInfo = v.union(
  v.object({ type: v.literal("original") }),
  v.object({ type: v.literal("edit"), fromMessageId: v.string() }),
  v.object({ type: v.literal("regeneration"), fromMessageId: v.string() })
);

const attachmentStatus = v.union(v.literal("draft"), v.literal("attached"));

export const messageSettings = v.object({
  model: v.string(),
  tools: v.union(v.record(v.string(), v.any()), v.array(v.string())), // temporary legacy compatibility for old string[] rows
  temperature: v.optional(v.number()), // temporary legacy compatibility so old rows can be backfilled away
  // maybe use `false` for disabled, and a object as config for enabled. This way new tools can be added without being auto-disabled
});

export default defineSchema({
  defaultMessageSettings: defineTable({
    userId: v.string(),
    settings: messageSettings,
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  threads: defineTable({
    threadId: v.string(),
    userId: v.string(),
    name: v.string(),
    status: threadStatus,
    settings: messageSettings,
    activeStreamId: v.optional(v.string()),
    activeStreamClientId: v.optional(v.string()), // Client session ID that initiated the active stream
    updatedAt: v.number(),
  })
    .index("by_threadId", ["threadId"])
    .index("by_userId", ["userId", "updatedAt"]),

  messages: defineTable({
    threadId: v.string(),
    messageId: v.string(),
    parentId: v.optional(v.string()),
    role: messageRole,
    parts: v.array(v.any()),
    status: messageStatus,
    depth: v.number(),
    siblingIndex: v.number(),
    mutation: mutationInfo,
    model: v.optional(v.string()),
    canceledAt: v.optional(v.number()),
    usage: v.optional(
      v.object({
        promptTokens: v.number(),
        responseTokens: v.number(),
        totalTokens: v.number(),
      })
    ),
    generationStats: v.optional(
      v.object({
        timeToFirstTokenMs: v.number(),
        totalDurationMs: v.number(),
        tokensPerSecond: v.number(),
      })
    ),
    error: v.optional(v.string()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_threadId_messageId", ["threadId", "messageId"])
    .index("by_parentId", ["parentId", "siblingIndex"]),

  attachments: defineTable({
    attachmentId: v.string(),
    userId: v.string(),
    threadId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    status: attachmentStatus,
    projectId: v.string(),
    environmentId: v.string(),
    accessKey: v.string(),
    fileKeyId: v.string(),
    fileId: v.optional(v.string()),
    fileName: v.string(),
    mimeType: v.string(),
    size: v.number(),
    isPublic: v.boolean(),
    serveImage: v.boolean(),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attachmentId", ["attachmentId"])
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_threadId", ["threadId"])
    .index("by_messageId", ["messageId"])
    .index("by_accessKey", ["accessKey"])
    .index("by_fileKeyId", ["fileKeyId"]),
});

