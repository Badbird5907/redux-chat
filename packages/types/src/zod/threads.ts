import { zid } from "convex-helpers/server/zod4";
import { z } from "zod";

export const messageStatus = z.enum(["generating", "completed", "failed"]);
export const threadStatus = z.enum(["generating", "completed"]);
const messageRole = z.enum(["user", "assistant", "system"]);

const mutationInfo = z.discriminatedUnion("type", [
  z.object({ type: z.literal("original") }),
  z.object({ type: z.literal("edit"), fromMessageId: zid("messages") }),
  z.object({ type: z.literal("regeneration"), fromMessageId: zid("messages") }),
]);

const messageToolsSchema = z.object({
  search: z.object({}).optional(),
  bashWorkspace: z.object({}).optional(),
  analysisWorkspace: z
    .object({
      syncUploads: z.boolean().optional(),
    })
    .optional(),
});

export const messageSchema = z.object({
  // messages should be immutable
  threadId: zid("threads"),
  parentId: zid("messages").optional(),
  role: messageRole,
  content: z.string(),
  status: messageStatus,
  depth: z.number(),
  siblingIndex: z.number(), // ordering among siblings with same parent

  // Mutation tracking (for UI badges like "edited" / "regenerated")
  mutation: mutationInfo,

  // metadata (assistant messages only)
  model: z.string().optional(),
  usage: z
    .object({
      promptTokens: z.number(),
      responseTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
  error: z.string().optional(),
  attachments: z
    .array(
      z.object({
        attachmentId: z.string(),
        fileName: z.string(),
        mimeType: z.string(),
        size: z.number(),
        serveImage: z.boolean().optional(),
        isPublic: z.boolean().optional(),
        expiresAt: z.number().optional(),
      }),
    )
    .optional(),
});

export const threadSchema = z.object({
  userId: zid("users"),

  name: z.string(),
  status: threadStatus,

  settings: z.object({
    model: z.string(),
    instructionId: z.string().optional(),
    tools: messageToolsSchema,
  }),

  selectedLeafMessageId: z.string().optional(),
  updatedAt: z.number(),
});

export type Thread = z.infer<typeof threadSchema>;
export type Message = z.infer<typeof messageSchema>;
