"use client";

import type { UIMessage } from "ai";
import { memo, useMemo, useState } from "react";
import { isTextUIPart } from "ai";
import {
  ArrowRightLeft,
  CheckIcon,
  CircleAlert,
  CopyIcon,
  FileText,
  Loader2,
  PencilIcon,
  RefreshCwIcon,
  Square,
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

function CollapsibleUserMessageText({
  textContent,
  previewMaxLines,
}: {
  textContent: string;
  previewMaxLines: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const lines = textContent.split(/\r?\n/);
  const shouldOfferCollapse =
    previewMaxLines > 0 && lines.length > previewMaxLines && !expanded;

  const displayContent = shouldOfferCollapse
    ? lines.slice(0, previewMaxLines).join("\n")
    : textContent;

  return (
    <div className="max-w-full min-w-0 wrap-break-word whitespace-pre-wrap">
      {displayContent}
      {shouldOfferCollapse ? (
        <button
          type="button"
          className={cn(
            "mt-2 text-sm font-medium underline underline-offset-2",
            "opacity-90 hover:opacity-100",
          )}
          onClick={() => setExpanded(true)}
        >
          Show more
        </button>
      ) : null}
    </div>
  );
}

function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const t = text.trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      className={cn(
        "hover:bg-muted rounded p-2 transition-colors disabled:opacity-50",
      )}
      title="Copy"
      type="button"
      disabled={!text.trim()}
      onClick={handleCopy}
    >
      {copied ? (
        <CheckIcon className="size-4" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </button>
  );
}

export interface ChatMessageRowProps {
  message: ChatMessageWithThreadMetadata;
  index: number;
  totalCount: number;
  status: string;
  messageStats?: MessageStats;
  resolvedMessageAttachments: Record<string, ResolvedAttachment>;
  messageAttachmentsByMessageId: Map<string, MessageAttachmentSummary[]>;
  assistantModelByParentMessageId: Map<string, string>;
  allBranchMessages: ChatMessageWithThreadMetadata[];
  onRegenerateMessage: (message: ChatMessageWithThreadMetadata) => void;
  onSelectBranch: (messageId: string) => void;
  onStartEditMessage: (messageId: string) => void;
  readOnly?: boolean;
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
  /** Max newline-separated lines before "Show more"; `0` disables collapsing. From chat settings. */
  userMessagePreviewMaxLines: number;
}

export const ChatMessageRow = memo(function ChatMessageRow({
  message,
  index,
  totalCount,
  status,
  messageStats,
  resolvedMessageAttachments,
  messageAttachmentsByMessageId,
  assistantModelByParentMessageId,
  allBranchMessages,
  onRegenerateMessage,
  onSelectBranch,
  onStartEditMessage,
  readOnly = false,
  onAttachmentPreview,
  userMessagePreviewMaxLines,
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
  const isStoppedMessage =
    message.role === "assistant" && Boolean(message.canceledAt);
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
    !isStoppedMessage &&
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
        "group flex w-full min-w-0",
        message.role === "user" ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          message.role === "user"
            ? "flex max-w-full flex-col items-end"
            : "w-full min-w-0",
        )}
      >
        <div
          className={cn(
            "max-w-full min-w-0 rounded-lg px-4 py-2",
            message.role === "user" &&
              "bg-primary text-primary-foreground max-w-full min-w-0",
          )}
        >
          {(!message.parts.length || showStreamingPlaceholder) &&
            !isFailedMessage &&
            !isStoppedMessage && <Spinner className="size-4" />}
          {isFailedMessage && !message.parts.length ? (
            <Card
              size="sm"
              className="border-destructive/40 bg-destructive/10 text-destructive ring-destructive/20 w-full gap-2 py-3 shadow-none"
            >
              <CardContent className="flex items-start gap-3 px-3">
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
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
            <>
              <AssistantMessageParts
                isLastMessage={isLastMessage}
                isStreaming={isStreamingAssistant}
                message={message}
                messageStats={messageStats}
              />
              {isStoppedMessage && (
                <Card
                  size="sm"
                  className="border-border bg-muted/40 text-muted-foreground mt-3 w-fit gap-2 py-2 shadow-none"
                >
                  <CardContent className="flex items-center gap-2 px-3 text-sm">
                    <Square className="size-3 fill-current" />
                    <span>Generation stopped by user</span>
                  </CardContent>
                </Card>
              )}
              {isFailedMessage && message.parts.length > 0 && (
                <Card
                  size="sm"
                  className="border-destructive/40 bg-destructive/10 text-destructive ring-destructive/20 mt-3 w-full gap-2 py-3 shadow-none"
                >
                  <CardContent className="flex items-start gap-3 px-3">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" />
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        A tool call encountered an error
                      </p>
                      {message.error && (
                        <p className="text-destructive/80 wrap-break-word">
                          {message.error}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <CollapsibleUserMessageText
              previewMaxLines={userMessagePreviewMaxLines}
              textContent={textContent}
            />
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
                      {usedDerivative && <ArrowRightLeft className="size-3" />}
                      {generatingDerivative && (
                        <Loader2 className="size-3 animate-spin" />
                      )}
                    </span>
                  )}
                  {isImage && attachment.url && !isExpired ? (
                    <img
                      src={attachment.url}
                      alt={attachmentDisplayName(attachment)}
                      className="size-10 rounded object-cover"
                    />
                  ) : (
                    <FileText className="size-4 shrink-0" />
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
          <div className="text-muted-foreground mt-2 flex min-h-8 items-center justify-end gap-1 text-xs opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100">
            <BranchSwitcher
              branchGroup={branchGroup}
              disabled={controlsDisabled}
              onSelectBranch={onSelectBranch}
            />
            <MessageCopyButton text={textContent} />
            {!readOnly && (
              <>
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
              </>
            )}
          </div>
        )}
        {message.role === "assistant" && (
          <div
            className={cn(
              "text-muted-foreground mt-2 flex min-h-8 items-center justify-between gap-1 text-xs transition-opacity duration-200",
              isStreamingAssistant
                ? "opacity-0"
                : "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
            )}
          >
            <div className="flex items-center gap-1">
              <BranchSwitcher
                branchGroup={branchGroup}
                disabled={controlsDisabled}
                onSelectBranch={onSelectBranch}
              />
              <MessageCopyButton text={textContent} />
              {!readOnly && (
                <button
                  className={cn(
                    "hover:bg-muted rounded p-2 transition-colors disabled:opacity-50",
                  )}
                  title="Regenerate"
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => onRegenerateMessage(message)}
                >
                  <RefreshCwIcon className="size-4" />
                </button>
              )}
            </div>
            <MessageStatsBar
              stats={messageStats}
              actionsDisabled={controlsDisabled}
            />
          </div>
        )}
      </div>
    </div>
  );
});
