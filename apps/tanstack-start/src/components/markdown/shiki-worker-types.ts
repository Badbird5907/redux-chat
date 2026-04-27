import type { MarkdownThemeId } from "./shiki-config";

export interface HighlightRequestMessage {
  type: "highlight";
  requestId: number;
  cacheKey: string;
  code: string;
  language: string;
  theme: MarkdownThemeId;
}

export interface HighlightSuccessMessage {
  type: "success";
  requestId: number;
  cacheKey: string;
  html: string;
}

export interface HighlightErrorMessage {
  type: "error";
  requestId: number;
  cacheKey: string;
  error: string;
}

export type WorkerRequestMessage = HighlightRequestMessage;
export type WorkerResponseMessage =
  | HighlightSuccessMessage
  | HighlightErrorMessage;
