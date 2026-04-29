"use client";

import type { UIMessage } from "ai";
import type { ComponentProps, ReactNode } from "react";
import { memo, useCallback } from "react";

import type { ChatMessageRowProps } from "./chat-message-row";
import type {
  ChatMessageWithThreadMetadata,
  MessageAttachmentSummary,
  MessageStats,
  ResolvedAttachment,
} from "./chat-types";
import { ChatMessageRow } from "./chat-message-row";
import { EmptyChat } from "./empty";

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
  settings: ComponentProps<typeof EmptyChat>["settings"];
  status: string;
  messageStatsMap: Map<string, MessageStats>;
  hoveredMessageId: string | null;
  setHoveredMessageId: (id: string | null) => void;
  resolvedMessageAttachments: Record<string, ResolvedAttachment>;
  messageAttachmentsByMessageId: Map<string, MessageAttachmentSummary[]>;
  assistantModelByParentMessageId: Map<string, string>;
  setPreviewFile: ChatMessageRowProps["onAttachmentPreview"];
  onRegenerateMessage: (messageId: string) => void;
}

export const ChatMessageList = memo(function ChatMessageList({
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
  onRegenerateMessage,
}: ChatMessageListProps) {
  const handleHoverChange = useCallback(
    (id: string | null) => {
      setHoveredMessageId(id);
    },
    [setHoveredMessageId],
  );

  const totalCount = finalMessages.length;

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
          {finalMessages.map((message, index) => (
            <ChatMessageRow
              key={message.id}
              assistantModelByParentMessageId={assistantModelByParentMessageId}
              index={index}
              isHovered={hoveredMessageId === message.id}
              message={message}
              messageAttachmentsByMessageId={messageAttachmentsByMessageId}
              messageStats={messageStatsMap.get(message.id)}
              onAttachmentPreview={setPreviewFile}
              onHoverChange={handleHoverChange}
              onRegenerateMessage={onRegenerateMessage}
              resolvedMessageAttachments={resolvedMessageAttachments}
              status={status}
              totalCount={totalCount}
            />
          ))}
        </div>
      )}
    </div>
  );
});
