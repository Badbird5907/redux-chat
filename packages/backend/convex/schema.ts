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

export const threadSettings = v.object({
  model: v.string(),
  temperature: v.number(),
  tools: v.array(v.string()),
});

export default defineSchema({
  threads: defineTable({
    threadId: v.string(),
    userId: v.string(),
    name: v.string(),
    status: threadStatus,
    settings: threadSettings,
    currentLeafMessageId: v.optional(v.string()),
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
});

