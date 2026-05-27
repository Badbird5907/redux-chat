"use client";

import type { ReactNode } from "react";

import { cn } from "@redux/ui/lib/utils";

import type { ChatPreload } from "./preload";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { ChatMessageList } from "./chat-message-list";
import { InitialThreadScrollInitializer } from "./initial-thread-scroll-initializer";
import { ChatInput } from "./input";
import { useChatSession } from "./use-chat-session";

export function Chat({
  initialThreadId,
  chatProjectId,
  preload,
  emptyContent,
}: {
  initialThreadId: string | undefined;
  chatProjectId?: string;
  preload?: ChatPreload;
  /** Custom content when there's no active thread. Defaults to <EmptyChat />. */
  emptyContent?: ReactNode;
}) {
  const {
    currentThreadId,
    handleThreadIdChange,
    effectiveChatProjectId,
    chatSessionId,
    messages,
    status,
    sendMessageWithTracking,
    stopGeneration,
    setOptimisticMessage,
    convexUIMessages,
    allBranchMessages,
    finalMessages,
    selectBranch,
    startEditMessage,
    cancelEditMessage,
    editMessage,
    submitEditedMessage,
    regenerateMessage,
    shouldInitializeInitialThreadScroll,
    handleInitialThreadScrollReady,
    messageStatsMap,
    previewFile,
    setPreviewFile,
    resolvedMessageAttachments,
    messageAttachmentsByMessageId,
    assistantModelByParentMessageId,
    settings,
    settingsReady,
    setModel,
    updateSettings,
  } = useChatSession({ initialThreadId, chatProjectId, preload });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation className="relative size-full">
        <InitialThreadScrollInitializer
          enabled={shouldInitializeInitialThreadScroll}
          onReady={handleInitialThreadScrollReady}
        />
        <ConversationContent
          className={cn(
            "pt-0 pb-36 transition-opacity duration-200 ease-out",
            shouldInitializeInitialThreadScroll
              ? "pointer-events-none opacity-0"
              : "opacity-100",
          )}
        >
          <ChatMessageList
            assistantModelByParentMessageId={assistantModelByParentMessageId}
            allBranchMessages={allBranchMessages}
            chatSessionId={chatSessionId}
            convexUIMessages={convexUIMessages}
            currentThreadId={currentThreadId}
            effectiveChatProjectId={effectiveChatProjectId}
            emptyContent={emptyContent}
            finalMessages={finalMessages}
            handleThreadIdChange={handleThreadIdChange}
            messageAttachmentsByMessageId={messageAttachmentsByMessageId}
            messageStatsMap={messageStatsMap}
            resolvedMessageAttachments={resolvedMessageAttachments}
            onRegenerateMessage={regenerateMessage}
            sendMessageWithTracking={sendMessageWithTracking}
            onSelectBranch={selectBranch}
            onStartEditMessage={startEditMessage}
            setOptimisticMessage={setOptimisticMessage}
            setPreviewFile={setPreviewFile}
            settings={settings}
            status={status}
          />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <ChatInput
        threadId={currentThreadId}
        chatProjectId={effectiveChatProjectId}
        setThreadId={handleThreadIdChange}
        sendMessage={sendMessageWithTracking}
        onStopGeneration={stopGeneration}
        setOptimisticMessage={setOptimisticMessage}
        messages={messages}
        status={status}
        clientId={chatSessionId}
        convexMessages={convexUIMessages}
        settings={settings}
        settingsReady={settingsReady}
        onModelChange={setModel}
        onSettingsChange={updateSettings}
        editMessage={editMessage}
        onCancelEdit={cancelEditMessage}
        onSubmitEdit={submitEditedMessage}
      />

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
}
