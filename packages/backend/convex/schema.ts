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

const thinkingLevel = v.union(
  v.literal("instant"),
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
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

const creditBucket = v.union(
  v.literal("gifted"),
  v.literal("monthly"),
  // Legacy bucket kept for backwards compatibility with pre-migration rows.
  // New writes should use `monthly` for recurring allowances.
  v.literal("free"),
  v.literal("paid"),
);

const creditGrantStatus = v.union(
  v.literal("active"),
  v.literal("exhausted"),
  v.literal("expired"),
  v.literal("revoked"),
);

const creditTopUpIntentStatus = v.union(
  v.literal("created"),
  v.literal("checkout_created"),
  v.literal("paid"),
  v.literal("expired"),
  v.literal("failed"),
);

const promotionKind = v.union(
  v.literal("app_credits"),
  v.literal("subscription_discount"),
  v.literal("stripe_invoice_credit"),
);

const promotionStatus = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("archived"),
);

const promotionRedemptionStatus = v.union(
  v.literal("reserved"),
  v.literal("pending_checkout"),
  v.literal("applied"),
  v.literal("failed"),
  v.literal("revoked"),
);

const paidPlanTier = v.union(v.literal("plus"), v.literal("pro"));

const threadShareSettings = v.object({
  onlyCurrentBranch: v.boolean(),
  includeAttachments: v.boolean(),
  autoUpdate: v.boolean(),
});

const messageTools = v.object({
  search: v.optional(v.union(v.object({}), v.literal(false))),
  bashWorkspace: v.optional(v.union(v.object({}), v.literal(false))),
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
        serverIds: v.optional(v.array(v.string())),
      }),
      v.literal(false),
    ),
  ),
  imageGeneration: v.optional(
    v.union(
      v.object({
        modelId: v.optional(v.string()),
      }),
      v.literal(false),
    ),
  ),
});

export const messageSettings = v.object({
  model: v.string(),
  tools: messageTools,
  thinkingLevel: v.optional(thinkingLevel),
  instructionId: v.optional(v.string()),
  userMessagePreviewMaxLines: v.optional(v.number()),
});

export default defineSchema({
  mcpServers: defineTable({
    mcpServerId: v.string(),
    userId: v.string(),
    name: v.string(),
    url: v.string(),
    authHeaders: v.optional(
      v.array(
        v.object({
          name: v.string(),
          value: v.string(),
        }),
      ),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_mcpServerId", ["mcpServerId"])
    .index("by_userId", ["userId", "updatedAt"]),

  defaultMessageSettings: defineTable({
    userId: v.string(),
    settings: messageSettings,
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  userSettings: defineTable({
    userId: v.string(),
    modelFavoritesInitializedAt: v.optional(v.number()),
    mcpServersEnabled: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  userUsageStats: defineTable({
    userId: v.string(),
    userMessageCount: v.number(),
    threadCount: v.number(),
    attachmentCount: v.number(),
    storageBytes: v.number(),
    lastActiveAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  userDailyUsageStats: defineTable({
    userId: v.string(),
    dayKey: v.string(),
    assistantApiCalls: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_day", ["userId", "dayKey"]),

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

  instructions: defineTable({
    instructionId: v.string(),
    userId: v.string(),
    name: v.string(),
    description: v.string(),
    prompt: v.optional(v.string()),
    defaultPrompt: v.optional(v.string()),
    userEdited: v.optional(v.boolean()),
    hidden: v.optional(v.boolean()),
    builtinKey: v.optional(
      v.union(v.literal("default"), v.literal("learning")),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_instructionId", ["instructionId"])
    .index("by_userId", ["userId", "updatedAt"])
    .index("by_userId_builtinKey", ["userId", "builtinKey"]),

  threads: defineTable({
    threadId: v.string(),
    userId: v.string(),
    name: v.string(),
    titleSource: v.optional(v.union(v.literal("user"), v.literal("generated"))),
    titleGeneratedAt: v.optional(v.number()),
    titleGenerationRequestedAt: v.optional(v.number()),
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

  threadShares: defineTable({
    shareId: v.string(),
    threadId: v.string(),
    userId: v.string(),
    settings: threadShareSettings,
    anchorLeafMessageId: v.optional(v.string()),
    snapshotMessageIds: v.optional(v.array(v.string())),
    snapshotSelectedLeafMessageId: v.optional(v.string()),
    viewCount: v.number(),
    forkCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_shareId", ["shareId"])
    .index("by_threadId", ["threadId", "createdAt"])
    .index("by_userId_threadId", ["userId", "threadId", "createdAt"]),

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
        reasoningDurationMs: v.optional(v.number()),
        timeToFirstTokenMs: v.number(),
        totalDurationMs: v.number(),
        tokensPerSecond: v.number(),
      }),
    ),
    error: v.optional(v.string()),
    thinkingLevel: v.optional(thinkingLevel),
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
    .index("by_userId_createdAt", ["userId", "createdAt"])
    .index("by_userId_status", ["userId", "status"])
    .index("by_threadId", ["threadId"])
    .index("by_messageId", ["messageId"])
    .index("by_chatProjectId", ["chatProjectId"])
    .index("by_accessKey", ["accessKey"])
    .index("by_fileKeyId", ["fileKeyId"]),

  generatedImages: defineTable({
    generatedImageId: v.string(),
    userId: v.string(),
    threadId: v.string(),
    messageId: v.string(),
    modelId: v.string(),
    provider: v.string(),
    source: v.literal("image_generation"),
    toolCallId: v.optional(v.string()),
    prompt: v.optional(v.string()),
    mimeType: v.string(),
    size: v.number(),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    projectId: v.string(),
    environmentId: v.string(),
    accessKey: v.string(),
    fileKeyId: v.string(),
    fileName: v.string(),
    createdAt: v.number(),
  })
    .index("by_generatedImageId", ["generatedImageId"])
    .index("by_threadId", ["threadId"])
    .index("by_messageId", ["messageId"])
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

  // Append-only ledger of credit grants (lots). Each grant is a spendable
  // bucket with `remaining`. Allocation reads only `active` grants for a
  // given user and consumes from them in priority + earliest-expiry order.
  // `source + sourceId` is required for idempotency on grant ingestion
  // (e.g. duplicate Stripe webhook deliveries).
  creditGrants: defineTable({
    grantId: v.string(),
    userId: v.string(),
    bucket: creditBucket,
    amount: v.number(),
    remaining: v.number(),
    status: creditGrantStatus,
    source: v.string(), // "stripe_subscription_renewal", "stripe_one_time_purchase", "free_monthly_reset", "admin_grant", "migration_backfill"
    sourceId: v.string(), // id key for idempotency (e.g. Stripe payment intent id, subscription period id, "userId:YYYY-MM")
    periodKey: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    grantedAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_grantId", ["grantId"])
    .index("by_user_status_expires", [
      "userId",
      "status",
      "bucket",
      "expiresAt",
    ])
    .index("by_user_granted_at", ["userId", "grantedAt"])
    .index("by_user_bucket_period", ["userId", "bucket", "periodKey"])
    .index("by_source_sourceId", ["source", "sourceId"]),

  // Idempotent debit records (one per chargeable usage event). Keyed by
  // `requestKey` (typically an assistant message id) so that retries and
  // stream reconnections cannot double-charge.
  creditDebits: defineTable({
    debitId: v.string(),
    userId: v.string(),
    requestKey: v.string(),
    amount: v.number(),
    allocatedAmount: v.number(),
    overdraftAmount: v.number(),
    overageAllowed: v.boolean(),
    routeId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    messageId: v.optional(v.string()),
    rawUsdCost: v.optional(v.number()),
    effectiveUsdCost: v.optional(v.number()),
    markupMultiplier: v.optional(v.number()),
    tier: v.optional(v.string()),
    metadata: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_debitId", ["debitId"])
    .index("by_user_requestKey", ["userId", "requestKey"])
    .index("by_user_createdAt", ["userId", "createdAt"]),

  creditTopUpIntents: defineTable({
    intentId: v.string(),
    userId: v.string(),
    amountCents: v.number(),
    currency: v.literal("usd"),
    credits: v.number(),
    status: creditTopUpIntentStatus,
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_intentId", ["intentId"])
    .index("by_checkoutId", ["stripeCheckoutSessionId"])
    .index("by_user_status", ["userId", "status"]),

  stripeCustomerOverrides: defineTable({
    userId: v.string(),
    stripeCustomerId: v.string(),
    email: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_userId", ["userId"]),

  promotions: defineTable({
    promotionId: v.string(),
    code: v.string(),
    codeNormalized: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    status: promotionStatus,
    kind: promotionKind,
    maxRedemptions: v.optional(v.number()),
    perUserRedemptionLimit: v.optional(v.number()),
    pauseOnRedemptionLimit: v.optional(v.boolean()),
    autoStatusFromLimit: v.optional(v.boolean()),
    redeemedCount: v.number(),
    startsAt: v.optional(v.number()),
    endsAt: v.optional(v.number()),
    createdByUserId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    metadata: v.optional(v.any()),
  })
    .index("by_promotionId", ["promotionId"])
    .index("by_codeNormalized", ["codeNormalized"])
    .index("by_status_createdAt", ["status", "createdAt"])
    .index("by_kind_createdAt", ["kind", "createdAt"]),

  promotionRedemptions: defineTable({
    redemptionId: v.string(),
    promotionId: v.string(),
    codeNormalized: v.string(),
    userId: v.string(),
    status: promotionRedemptionStatus,
    kind: promotionKind,
    reservedAt: v.number(),
    appliedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    targetTier: v.optional(paidPlanTier),
    appCreditGrantId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripeCouponId: v.optional(v.string()),
    stripeCreditGrantId: v.optional(v.string()),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripeCheckoutSessionExpiresAt: v.optional(v.number()),
    stripeCustomerBalanceTransactionId: v.optional(v.string()),
    metadata: v.optional(v.any()),
  })
    .index("by_redemptionId", ["redemptionId"])
    .index("by_promotion_reservedAt", ["promotionId", "reservedAt"])
    .index("by_user_promotion", ["userId", "promotionId"])
    .index("by_user_codeNormalized", ["userId", "codeNormalized"])
    .index("by_status_reservedAt", ["status", "reservedAt"]),

  // Per-debit per-grant allocation rows. Preserved for audit so the
  // exact slice of each lot consumed by each request is recoverable.
  creditDebitAllocations: defineTable({
    allocationId: v.string(),
    debitId: v.string(),
    grantId: v.string(),
    userId: v.string(),
    bucket: creditBucket,
    amount: v.number(),
    createdAt: v.number(),
  })
    .index("by_debitId", ["debitId"])
    .index("by_grantId", ["grantId"])
    .index("by_userId", ["userId", "createdAt"]),
});
