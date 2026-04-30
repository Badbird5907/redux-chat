import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const messageStatus = v.union(
  v.literal("generating"),
  v.literal("completed"),
  v.literal("failed"),
);

// primarily controls the ui sidebar
const threadStatus = v.union(v.literal("generating"), v.literal("completed"));

const messageRole = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("system"),
);

const mutationInfo = v.union(
  v.object({ type: v.literal("original") }),
  v.object({ type: v.literal("edit"), fromMessageId: v.string() }),
  v.object({ type: v.literal("regeneration"), fromMessageId: v.string() }),
);

const attachmentStatus = v.union(v.literal("draft"), v.literal("attached"));

const embeddingStatus = v.union(
  v.literal("queued"),
  v.literal("indexing"),
  v.literal("indexed"),
  v.literal("failed"),
);

const embeddingModality = v.union(
  v.literal("text"),
  v.literal("image"),
  v.literal("pdf_page"),
);

const messageTools = v.object({
  search: v.optional(v.object({})),
  analysisWorkspace: v.optional(
    v.object({
      syncUploads: v.optional(v.boolean()),
    }),
  ),
});

export const messageSettings = v.object({
  model: v.string(),
  tools: messageTools,
});

export default defineSchema({
  defaultMessageSettings: defineTable({
    userId: v.string(),
    settings: messageSettings,
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  userSettings: defineTable({
    userId: v.string(),
    modelFavoritesInitializedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  modelFavorites: defineTable({
    userId: v.string(),
    modelId: v.string(),
    sortOrder: v.number(),
    fromDefault: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId", "sortOrder"])
    .index("by_userId_modelId", ["userId", "modelId"]),

  projects: defineTable({
    projectId: v.string(),
    userId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    instructions: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_projectId", ["projectId"])
    .index("by_userId", ["userId", "updatedAt"]),

  threads: defineTable({
    threadId: v.string(),
    userId: v.string(),
    name: v.string(),
    /** Sidebar title provenance — drives typewriter UX for AI-generated titles. */
    titleSource: v.optional(v.union(v.literal("user"), v.literal("generated"))),
    /** Latest time an AI/regenerated title was applied; cleared when the user edits the title. */
    titleGeneratedAt: v.optional(v.number()),
    status: threadStatus,
    settings: messageSettings,
    selectedLeafMessageId: v.optional(v.string()),
    activeStreamId: v.optional(v.string()),
    activeStreamMessageId: v.optional(v.string()),
    activeStreamClientId: v.optional(v.string()), // Client session ID that initiated the active stream
    deadMessageCheckSchedulerId: v.optional(v.id("_scheduled_functions")),
    updatedAt: v.number(),
    // Optional FK to user-facing projects table (distinct from Silo's projectId on attachments)
    chatProjectId: v.optional(v.string()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_userId", ["userId", "updatedAt"])
    .index("by_userId_chatProjectId", ["userId", "chatProjectId", "updatedAt"]),

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
      }),
    ),
    generationStats: v.optional(
      v.object({
        timeToFirstTokenMs: v.number(),
        totalDurationMs: v.number(),
        tokensPerSecond: v.number(),
      }),
    ),
    error: v.optional(v.string()),
  })
    .index("by_threadId", ["threadId"])
    .index("by_threadId_messageId", ["threadId", "messageId"])
    .index("by_threadId_parentId", ["threadId", "parentId", "siblingIndex"])
    .index("by_parentId", ["parentId", "siblingIndex"]),

  attachments: defineTable({
    attachmentId: v.string(),
    userId: v.string(),
    threadId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    // Optional FK to user-facing projects table (project file library).
    // Different from `projectId` below (which is the Silo storage projectId).
    chatProjectId: v.optional(v.string()),
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
    // RAG indexing state for project files (only set when chatProjectId is set).
    embeddingStatus: v.optional(embeddingStatus),
    embeddingError: v.optional(v.string()),
    embeddingChunkCount: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_attachmentId", ["attachmentId"])
    .index("by_userId", ["userId"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_threadId", ["threadId"])
    .index("by_messageId", ["messageId"])
    .index("by_chatProjectId", ["chatProjectId"])
    .index("by_accessKey", ["accessKey"])
    .index("by_fileKeyId", ["fileKeyId"]),

  // Vector embeddings of project file chunks. Separate from `attachments` so
  // a vector index can have a fixed dim and so the table can be wiped/migrated
  // independently of the file metadata. Wrapped behind the VectorStore
  // interface in apps/tanstack-start/src/server/rag/* — this table can be
  // dropped wholesale when migrating to an external vector DB.
  attachmentEmbeddings: defineTable({
    embeddingId: v.string(),
    attachmentId: v.string(),
    chatProjectId: v.string(),
    userId: v.string(),
    chunkIndex: v.number(),
    modality: embeddingModality,
    pageNumber: v.optional(v.number()),
    text: v.optional(v.string()),
    embedding: v.array(v.float64()),
    embeddingModel: v.string(),
    embeddingDims: v.number(),
    createdAt: v.number(),
  })
    .index("by_attachmentId", ["attachmentId"])
    .index("by_chatProjectId", ["chatProjectId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 3072,
      filterFields: ["chatProjectId"],
    }),
});
