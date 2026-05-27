import type { UIMessage } from "ai";

import type { api } from "@redux/backend/convex/_generated/api";
import type { ThinkingLevel } from "@redux/shared/models";

export interface MessageStats {
  usage?: {
    promptTokens: number;
    responseTokens: number;
    totalTokens: number;
  };
  generationStats?: {
    reasoningDurationMs?: number;
    timeToFirstTokenMs: number;
    totalDurationMs: number;
    tokensPerSecond: number;
  };
  model?: string;
  thinkingLevel?: ThinkingLevel;
  content?: string;
}

export interface ResolvedAttachment {
  attachmentId: string;
  fileName: string;
  convertingToPdf?: boolean;
  generatingDerivative?: boolean;
  originalFileName?: string;
  usedDerivative?: boolean;
  mimeType: string;
  size: number;
  expiresAt?: number;
  expired?: boolean;
  url?: string;
}

export interface MessageAttachmentSummary {
  attachmentId: string;
  convertingToPdf?: boolean;
  generatingDerivative?: boolean;
  fileName: string;
  originalFileName?: string;
  usedDerivative?: boolean;
  mimeType: string;
  size: number;
  expiresAt?: number;
  expired?: boolean;
  url?: string;
}

export type PersistedChatMessage =
  (typeof api.functions.threads.getThreadMessages)["_returnType"][number];

export type ChatMessageWithThreadMetadata = UIMessage & {
  attachments?: MessageAttachmentSummary[];
  canceledAt?: number;
  createdAt?: number;
  depth?: number;
  error?: string;
  model?: string;
  thinkingLevel?: ThinkingLevel;
  mutation?: PersistedChatMessage["mutation"];
  parentId?: string;
  siblingIndex?: number;
  status?: "generating" | "completed" | "failed";
};

export interface BranchGroup {
  currentIndex: number;
  siblings: ChatMessageWithThreadMetadata[];
}
