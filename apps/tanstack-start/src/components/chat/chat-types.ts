import type { UIMessage } from "ai";

import type { api } from "@redux/backend/convex/_generated/api";

/** Stats persisted with assistant messages in Convex */
export interface MessageStats {
  usage?: {
    promptTokens: number;
    responseTokens: number;
    totalTokens: number;
  };
  generationStats?: {
    timeToFirstTokenMs: number;
    totalDurationMs: number;
    tokensPerSecond: number;
  };
  model?: string;
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
  error?: string;
  model?: string;
  parentId?: string;
  status?: "generating" | "completed" | "failed";
};
