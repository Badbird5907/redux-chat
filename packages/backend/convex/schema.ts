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
  v.object({ type: v.literal("edit"), fromMessageId: v.id("messages") }),
  v.object({ type: v.literal("regeneration"), fromMessageId: v.id("messages") })
);

export const threadSettings = v.object({
  model: v.string(),
  temperature: v.number(),
  tools: v.array(v.string()),
});

export default defineSchema({
  threads: defineTable({
    userId: v.string(),
    name: v.string(),
    status: threadStatus,
    settings: threadSettings,
    currentLeafMessageId: v.optional(v.id("messages")),
    activeStreamId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_updated", ["updatedAt"])
    .index("by_status", ["status"])
    .index("by_user", ["userId"]),

  messages: defineTable({
    threadId: v.id("threads"),
    parentId: v.optional(v.id("messages")),
    role: messageRole,
    content: v.any(),
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
    error: v.optional(v.string()),
    aiSdkId: v.optional(v.string()), // this is the id 
  })
    .index("by_thread", ["threadId"])
    .index("by_parent", ["parentId", "siblingIndex"])
    .index("by_thread_depth", ["threadId", "depth"]),
});

