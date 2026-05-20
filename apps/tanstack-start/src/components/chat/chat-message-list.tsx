"use client";

import type { UIMessage } from "ai";
import type { ComponentProps, ReactNode } from "react";
import { memo } from "react";

import { DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES } from "@redux/types";

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
  resolvedMessageAttachments: Record<string, ResolvedAttachment>;
  messageAttachmentsByMessageId: Map<string, MessageAttachmentSummary[]>;
  assistantModelByParentMessageId: Map<string, string>;
  allBranchMessages: ChatMessageWithThreadMetadata[];
  onRegenerateMessage: (message: ChatMessageWithThreadMetadata) => void;
  onSelectBranch: (messageId: string) => void;
  onStartEditMessage: (messageId: string) => void;
  readOnly?: boolean;
  setPreviewFile: ChatMessageRowProps["onAttachmentPreview"];
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
  resolvedMessageAttachments,
  messageAttachmentsByMessageId,
  assistantModelByParentMessageId,
  allBranchMessages,
  onRegenerateMessage,
  onSelectBranch,
  onStartEditMessage,
  readOnly = false,
  setPreviewFile,
}: ChatMessageListProps) {
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
              allBranchMessages={allBranchMessages}
              index={index}
              message={message}
              messageAttachmentsByMessageId={messageAttachmentsByMessageId}
              messageStats={messageStatsMap.get(message.id)}
              onAttachmentPreview={setPreviewFile}
              onRegenerateMessage={onRegenerateMessage}
              onSelectBranch={onSelectBranch}
              onStartEditMessage={onStartEditMessage}
              readOnly={readOnly}
              resolvedMessageAttachments={resolvedMessageAttachments}
              status={status}
              totalCount={totalCount}
              userMessagePreviewMaxLines={
                settings.userMessagePreviewMaxLines ??
                DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES
              }
            />
          ))}
        </div>
      )}
    </div>
  );
});
