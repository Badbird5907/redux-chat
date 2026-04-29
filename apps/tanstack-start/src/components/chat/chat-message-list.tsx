"use client";

import type { UIMessage } from "ai";
import type { ComponentProps, ReactNode } from "react";
import { isTextUIPart } from "ai";
import {
  ArrowRightLeft,
  CircleAlert,
  FileText,
  Loader2,
} from "lucide-react";

import { Card, CardContent } from "@redux/ui/components/card";
import Spinner from "@redux/ui/components/spinner";
import { cn } from "@redux/ui/lib/utils";

import { AssistantMessageParts } from "@/components/chat/assistant-message-parts";
import { StaticMarkdown } from "@/components/markdown/static-markdown";

import type {
  ChatMessageWithThreadMetadata,
  MessageAttachmentSummary,
  MessageStats,
  ResolvedAttachment,
} from "./chat-types";
import {
  attachmentDisplayName,
  didUseDerivative,
  isAttachmentExpired,
  isGeneratingDerivative,
  modelUsesDerivativeForAttachment,
} from "./chat-message-utils";
import type { MessageSettings } from "@redux/types";

import { EmptyChat } from "./empty";
import { MessageStatsBar } from "./message-stats-bar";

interface ChatMessageListProps {
  currentThreadId: string | undefined;
  effectiveChatProjectId: string | undefined;
  emptyContent?: ReactNode;
  finalMessages: ChatMessageWithThreadMetadata[];
  handleThreadIdChange: (id: string) => void;
  sendMessageWithTracking: ComponentProps<typeof EmptyChat>["sendMessage"];
  chatSessionId: string;
  convexUIMessages: ChatMessageWithThreadMetadata[];
  setOptimisticMessage: (m: UIMessage | undefined) => void;
  settings: MessageSettings;
  status: string;
  messageStatsMap: Map<string, MessageStats>;
  hoveredMessageId: string | null;
  setHoveredMessageId: (id: string | null) => void;
  resolvedMessageAttachments: Record<string, ResolvedAttachment>;
  messageAttachmentsByMessageId: Map<string, MessageAttachmentSummary[]>;
  assistantModelByParentMessageId: Map<string, string>;
  setPreviewFile: (
    file: {
      generatingDerivative?: boolean;
      id: string;
      name: string;
      type: string;
      url?: string;
      usedDerivative?: boolean;
    } | null,
  ) => void;
}

export function ChatMessageList({
  currentThreadId,
  effectiveChatProjectId,
  emptyContent,
  finalMessages,
  handleThreadIdChange,
  sendMessageWithTracking,
  chatSessionId,
  convexUIMessages,
  setOptimisticMessage,
  settings,
  status,
  messageStatsMap,
  hoveredMessageId,
  setHoveredMessageId,
  resolvedMessageAttachments,
  messageAttachmentsByMessageId,
  assistantModelByParentMessageId,
  setPreviewFile,
}: ChatMessageListProps) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      {!currentThreadId && finalMessages.length === 0 ? (
        (emptyContent ?? (
          <EmptyChat
            threadId={currentThreadId}
            chatProjectId={effectiveChatProjectId}
            setThreadId={handleThreadIdChange}
            sendMessage={sendMessageWithTracking}
            clientId={chatSessionId}
            convexMessages={convexUIMessages}
            setOptimisticMessage={setOptimisticMessage}
            settings={settings}
          />
        ))
      ) : (
        <div className="flex flex-col gap-8">
          {finalMessages.map((message: ChatMessageWithThreadMetadata, i) => {
            const textContent = message.parts.reduce<string>(
              (content, part: UIMessage["parts"][number]) => {
                if (!isTextUIPart(part)) {
                  return content;
                }

                return content + part.text;
              },
              "",
            );
            const isLastMessage = i === finalMessages.length - 1;
            const isStreamingAssistant =
              (status === "streaming" || status === "submitted") &&
              message.role === "assistant" &&
              isLastMessage;
            const messageStats = messageStatsMap.get(message.id);
            const isHovered = hoveredMessageId === message.id;
            const isFailedMessage = message.status === "failed";
            const responseModel = assistantModelByParentMessageId.get(
              message.id,
            );
            const persistedAttachments: MessageAttachmentSummary[] =
              messageAttachmentsByMessageId
                .get(message.id)
                ?.map((attachment) => ({
                  ...attachment,
                  fileName:
                    resolvedMessageAttachments[attachment.attachmentId]
                      ?.fileName ?? attachment.fileName,
                  generatingDerivative:
                    resolvedMessageAttachments[attachment.attachmentId]
                      ?.generatingDerivative ??
                    attachment.generatingDerivative,
                  originalFileName:
                    resolvedMessageAttachments[attachment.attachmentId]
                      ?.originalFileName ?? attachment.originalFileName,
                  usedDerivative:
                    resolvedMessageAttachments[attachment.attachmentId]
                      ?.usedDerivative ??
                    attachment.usedDerivative ??
                    modelUsesDerivativeForAttachment(
                      responseModel,
                      attachment,
                    ),
                  mimeType:
                    resolvedMessageAttachments[attachment.attachmentId]
                      ?.mimeType ?? attachment.mimeType,
                  size:
                    resolvedMessageAttachments[attachment.attachmentId]?.size ??
                    attachment.size,
                  expired:
                    resolvedMessageAttachments[attachment.attachmentId]
                      ?.expired ??
                    isAttachmentExpired(attachment.expiresAt),
                  expiresAt:
                    resolvedMessageAttachments[attachment.attachmentId]
                      ?.expiresAt ?? attachment.expiresAt,
                  url:
                    resolvedMessageAttachments[attachment.attachmentId]?.url ??
                    attachment.url,
                })) ?? [];
            const messageMetadata = (
              "metadata" in message ? message.metadata : undefined
            ) as { attachments?: MessageAttachmentSummary[] } | undefined;
            const optimisticAttachments =
              persistedAttachments.length === 0 &&
              messageMetadata &&
              typeof messageMetadata === "object" &&
              Array.isArray(messageMetadata.attachments)
                ? messageMetadata.attachments
                : [];
            const attachmentsToRender =
              persistedAttachments.length > 0
                ? persistedAttachments
                : optimisticAttachments;

            return (
              <div
                key={message.id}
                className={cn(
                  "flex w-full",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
                onMouseEnter={() =>
                  message.role === "assistant" &&
                  setHoveredMessageId(message.id)
                }
                onMouseLeave={() => setHoveredMessageId(null)}
              >
                <div
                  className={cn(
                    "rounded-lg px-4 py-2",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "w-full",
                  )}
                >
                  {!message.parts.length && !isFailedMessage && (
                    <Spinner className="size-4" />
                  )}
                  {isFailedMessage ? (
                    <Card
                      size="sm"
                      className="border-destructive/40 bg-destructive/10 text-destructive ring-destructive/20 w-full gap-2 py-3 shadow-none"
                    >
                      <CardContent className="flex items-start gap-3 px-3">
                        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium">Message generation failed</p>
                          {message.error && (
                            <p className="text-destructive/80 wrap-break-word">
                              {message.error}
                            </p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ) : message.role === "assistant" ? (
                    <AssistantMessageParts
                      isLastMessage={isLastMessage}
                      isStreaming={isStreamingAssistant}
                      message={message}
                    />
                  ) : (
                    <StaticMarkdown content={textContent} />
                  )}
                  {attachmentsToRender.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {attachmentsToRender.map((attachment) => {
                        const isImage =
                          attachment.mimeType.startsWith("image/");
                        const isExpired =
                          attachment.expired ??
                          isAttachmentExpired(attachment.expiresAt);
                        const usedDerivative = didUseDerivative(attachment);
                        const generatingDerivative =
                          isGeneratingDerivative(attachment);
                        return (
                          <button
                            key={attachment.attachmentId}
                            type="button"
                            onClick={() =>
                              (generatingDerivative ||
                                (attachment.url && !isExpired)) &&
                              setPreviewFile({
                                id: attachment.attachmentId,
                                name: attachmentDisplayName(attachment),
                                type: attachment.mimeType,
                                url: attachment.url,
                                generatingDerivative,
                                usedDerivative,
                              })
                            }
                            className={cn(
                              "border-border bg-background/70 relative flex items-center gap-2 rounded-xl border px-3 py-2 text-left",
                              (generatingDerivative ||
                                (attachment.url && !isExpired)) &&
                                "hover:border-primary transition-colors",
                              isExpired &&
                                "text-muted-foreground opacity-70",
                            )}
                          >
                            {(usedDerivative || generatingDerivative) && (
                              <span
                                aria-hidden
                                className="text-muted-foreground bg-background/90 pointer-events-none absolute bottom-2 left-2 rounded p-px shadow-sm"
                                style={{
                                  transform:
                                    "translateX(-6px) translateY(5px)",
                                }}
                                title={
                                  generatingDerivative
                                    ? "Preparing derivative"
                                    : "Used derivative"
                                }
                              >
                                {usedDerivative && (
                                  <ArrowRightLeft className="h-3 w-3" />
                                )}
                                {generatingDerivative && (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                )}
                              </span>
                            )}
                            {isImage && attachment.url && !isExpired ? (
                              <img
                                src={attachment.url}
                                alt={attachmentDisplayName(attachment)}
                                className="h-10 w-10 rounded object-cover"
                              />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="block max-w-48 truncate text-sm">
                                {attachmentDisplayName(attachment)}
                              </span>
                              {isExpired && (
                                <span className="text-muted-foreground block text-xs">
                                  Expired
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {message.role === "assistant" && (
                    <MessageStatsBar
                      stats={messageStats}
                      isVisible={isHovered}
                      content={textContent}
                      isStreaming={isStreamingAssistant && isLastMessage}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
