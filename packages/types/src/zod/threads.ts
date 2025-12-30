import { z } from "zod";
import { zid } from "convex-helpers/server/zod4";

export const messageStatus = z.enum(["generating", "completed", "failed"]);

export const threadStatus = z.enum(["active", "archived"]);

export const messageSchema = z.object({
  threadId: zid("threads"),
  parentId: zid("messages").optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  status: messageStatus.optional(),
  depth: z.number().optional(),

  model: z.string().optional(),
  tools: z.array(z.any()).optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    responseTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional()
});

// Thread schema - represents a conversation
export const threadSchema = z.object({
  // Display name for the thread
  name: z.string(),
  
  // Overall thread status
  status: threadStatus,

  rootMessageId: zid("messages").optional(),
  
  updatedAt: z.number(),
});


export type Thread = z.infer<typeof threadSchema>;
export type Message = z.infer<typeof messageSchema>;
