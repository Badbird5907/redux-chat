import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";

export const messageStatus = z.enum(["generating", "completed", "failed"]);
export const threadStatus = z.enum(["active", "archived"]);
const messageRole = z.enum(["user", "assistant", "system"]);

const mutationInfo = z.discriminatedUnion("type", [
  z.object({ type: z.literal("original") }),
  z.object({ type: z.literal("edit"), fromMessageId: zid("messages") }),
  z.object({ type: z.literal("regeneration"), fromMessageId: zid("messages") }),
]);

export const messageSchema = z.object({ // messages should be immutable
  threadId: zid("threads"),
  parentId: zid("messages").optional(),
  role: messageRole,
  content: z.string(),
  status: messageStatus,
  depth: z.number(),
  siblingIndex: z.number(), // ordering among siblings with same parent

  // Mutation tracking (for UI badges like "edited" / "regenerated")
  mutation: mutationInfo,

  // Generation metadata (assistant messages only)
  model: z.string().optional(),
  usage: z
    .object({
      promptTokens: z.number(),
      responseTokens: z.number(),
      totalTokens: z.number(),
    })
    .optional(),
  error: z.string().optional(),
});

export const threadSchema = z.object({
  userId: zid("users"),
  
  name: z.string(),
  status: threadStatus,

  settings: z.object({
    model: z.string(),
    temperature: z.number(),
    tools: z.array(z.string()),
  }),

  currentLeafMessageId: zid("messages").optional(),
  updatedAt: z.number(),
});

export type Thread = z.infer<typeof threadSchema>;
export type Message = z.infer<typeof messageSchema>;