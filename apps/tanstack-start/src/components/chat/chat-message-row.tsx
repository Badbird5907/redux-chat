"use client";

import type { UIMessage } from "ai";
import { memo, useMemo } from "react";
import { isTextUIPart } from "ai";
import {
  ArrowRightLeft,
  CircleAlert,
  FileText,
  Loader2,
  PencilIcon,
  RefreshCwIcon,
} from "lucide-react";

import { Card, CardContent } from "@redux/ui/components/card";
import Spinner from "@redux/ui/components/spinner";
import { cn } from "@redux/ui/lib/utils";

import type {
  ChatMessageWithThreadMetadata,
  MessageAttachmentSummary,
  MessageStats,
  ResolvedAttachment,
} from "./chat-types";
import { AssistantMessageParts } from "@/components/chat/assistant-message-parts";
import { StaticMarkdown } from "@/components/markdown/static-markdown";
import { normalizeAssistantMessage } from "./assistant-message-timeline";
import { BranchSwitcher } from "./branch-switcher";
import { getSiblingBranchGroup } from "./chat-branching";
import {
  attachmentDisplayName,
  didUseDerivative,
  isAttachmentExpired,
  isGeneratingDerivative,
  modelUsesDerivativeForAttachment,
} from "./chat-message-utils";
import { MessageStatsBar } from "./message-stats-bar";

export interface ChatMessageRowProps {
  message: ChatMessageWithThreadMetadata;
  index: number;
  totalCount: number;
  status: string;
  messageStats?: MessageStats;
  isHovered: boolean;
  onHoverChange: (messageId: string | null) => void;
  resolvedMessageAttachments: Record<string, ResolvedAttachment>;
  messageAttachmentsByMessageId: Map<string, MessageAttachmentSummary[]>;
  assistantModelByParentMessageId: Map<string, string>;
  allBranchMessages: ChatMessageWithThreadMetadata[];
  onRegenerateMessage: (message: ChatMessageWithThreadMetadata) => void;
  onSelectBranch: (messageId: string) => void;
  onStartEditMessage: (messageId: string) => void;
  onAttachmentPreview: (
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

export const ChatMessageRow = memo(function ChatMessageRow({
  message,
  index,
  totalCount,
  status,
  messageStats,
  isHovered,
  onHoverChange,
  resolvedMessageAttachments,
  messageAttachmentsByMessageId,
  assistantModelByParentMessageId,
  allBranchMessages,
  onRegenerateMessage,
  onSelectBranch,
  onStartEditMessage,
  onAttachmentPreview,
}: ChatMessageRowProps) {
  const textContent = useMemo(
    () =>
      message.parts.reduce<string>(
        (content, part: UIMessage["parts"][number]) => {
          if (!isTextUIPart(part)) {
            return content;
          }
          return content + part.text;
        },
        "",
      ),
    [message.parts],
  );

  const isLastMessage = index === totalCount - 1;
  const isStreamingAssistant =
    (status === "streaming" || status === "submitted") &&
    message.role === "assistant" &&
    isLastMessage;

  const isFailedMessage = message.status === "failed";
  const responseModel = assistantModelByParentMessageId.get(message.id);
  const normalizedAssistantMessage = useMemo(
    () =>
      message.role === "assistant" ? normalizeAssistantMessage(message) : null,
    [message],
  );
  const hasRenderableAssistantContent = useMemo(() => {
    if (!normalizedAssistantMessage) {
      return false;
    }

    return (
      normalizedAssistantMessage.textContent.trim().length > 0 ||
      Boolean(normalizedAssistantMessage.reasoningText) ||
      normalizedAssistantMessage.steps.length > 0
    );
  }, [normalizedAssistantMessage]);
  const showStreamingPlaceholder =
    message.role === "assistant" &&
    isStreamingAssistant &&
    !isFailedMessage &&
    !hasRenderableAssistantContent;
  const branchGroup = getSiblingBranchGroup(allBranchMessages, message.id);
  const controlsDisabled = status === "streaming" || status === "submitted";

  const persistedAttachments: MessageAttachmentSummary[] = useMemo(() => {
    return (
      messageAttachmentsByMessageId.get(message.id)?.map((attachment) => ({
        ...attachment,
        fileName:
          resolvedMessageAttachments[attachment.attachmentId]?.fileName ??
          attachment.fileName,
        generatingDerivative:
          resolvedMessageAttachments[attachment.attachmentId]
            ?.generatingDerivative ?? attachment.generatingDerivative,
        originalFileName:
          resolvedMessageAttachments[attachment.attachmentId]
            ?.originalFileName ?? attachment.originalFileName,
        usedDerivative:
          resolvedMessageAttachments[attachment.attachmentId]?.usedDerivative ??
          attachment.usedDerivative ??
          modelUsesDerivativeForAttachment(responseModel, attachment),
        mimeType:
          resolvedMessageAttachments[attachment.attachmentId]?.mimeType ??
          attachment.mimeType,
        size:
          resolvedMessageAttachments[attachment.attachmentId]?.size ??
          attachment.size,
        expired:
          resolvedMessageAttachments[attachment.attachmentId]?.expired ??
          isAttachmentExpired(attachment.expiresAt),
        expiresAt:
          resolvedMessageAttachments[attachment.attachmentId]?.expiresAt ??
          attachment.expiresAt,
        url:
          resolvedMessageAttachments[attachment.attachmentId]?.url ??
          attachment.url,
      })) ?? []
    );
  }, [
    message.id,
    messageAttachmentsByMessageId,
    resolvedMessageAttachments,
    responseModel,
  ]);

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
      className={cn(
        "flex w-full",
        message.role === "user" ? "justify-end" : "justify-start",
      )}
      onMouseEnter={() => onHoverChange(message.id)}
      onMouseLeave={() => onHoverChange(null)}
    >
      <div
        className={cn(
          message.role === "user"
            ? "flex max-w-full flex-col items-end"
            : "w-full",
        )}
      >
        <div
          className={cn(
            "rounded-lg px-4 py-2",
            message.role === "user" && "bg-primary text-primary-foreground",
          )}
        >
          {(!message.parts.length || showStreamingPlaceholder) &&
            !isFailedMessage && <Spinner className="size-4" />}
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
        </div>
        {attachmentsToRender.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {attachmentsToRender.map((attachment) => {
              const isImage = attachment.mimeType.startsWith("image/");
              const isExpired =
                attachment.expired ?? isAttachmentExpired(attachment.expiresAt);
              const usedDerivative = didUseDerivative(attachment);
              const generatingDerivative = isGeneratingDerivative(attachment);
              return (
                <button
                  key={attachment.attachmentId}
                  type="button"
                  onClick={() =>
                    (generatingDerivative || (attachment.url && !isExpired)) &&
                    onAttachmentPreview({
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
                    (generatingDerivative || (attachment.url && !isExpired)) &&
                      "hover:border-primary transition-colors",
                    isExpired && "text-muted-foreground opacity-70",
                  )}
                >
                  {(usedDerivative || generatingDerivative) && (
                    <span
                      aria-hidden
                      className="text-muted-foreground bg-background/90 pointer-events-none absolute bottom-2 left-2 rounded p-px shadow-sm"
                      style={{
                        transform: "translateX(-6px) translateY(5px)",
                      }}
                      title={
                        generatingDerivative
                          ? "Preparing derivative"
                          : "Used derivative"
                      }
                    >
                      {usedDerivative && <ArrowRightLeft className="h-3 w-3" />}
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
        {message.role === "user" && (
          <div
            className={cn(
              "text-muted-foreground mt-2 flex min-h-[32px] items-center justify-end gap-1 text-xs transition-opacity duration-200",
              isHovered ? "opacity-100" : "opacity-0",
            )}
          >
            <BranchSwitcher
              branchGroup={branchGroup}
              disabled={controlsDisabled}
              onSelectBranch={onSelectBranch}
            />
            <button
              className="hover:bg-muted rounded p-2 transition-colors disabled:opacity-50"
              title="Regenerate"
              type="button"
              disabled={controlsDisabled}
              onClick={() => onRegenerateMessage(message)}
            >
              <RefreshCwIcon className="size-4" />
            </button>
            <button
              className="hover:bg-muted rounded p-2 transition-colors disabled:opacity-50"
              title="Edit"
              type="button"
              disabled={controlsDisabled}
              onClick={() => onStartEditMessage(message.id)}
            >
              <PencilIcon className="size-4" />
            </button>
          </div>
        )}
        {message.role === "assistant" && (
          <div className="mt-2 flex items-center justify-between gap-2">
            <BranchSwitcher
              branchGroup={branchGroup}
              disabled={controlsDisabled}
              onSelectBranch={onSelectBranch}
            />
            <MessageStatsBar
              stats={messageStats}
              isVisible={isHovered}
              content={textContent}
              actionsDisabled={controlsDisabled}
              onRegenerate={() => onRegenerateMessage(message)}
            />
          </div>
        )}
      </div>
    </div>
  );
});
