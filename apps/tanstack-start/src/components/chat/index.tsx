"use client";

import type { CSSProperties, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useStickToBottomContext } from "use-stick-to-bottom";

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

function ComposerHeightScrollAnchor({
  composerHeight,
}: {
  composerHeight: number;
}) {
  const { isAtBottom, scrollRef, scrollToBottom } = useStickToBottomContext();
  const wasAtBottomRef = useRef(isAtBottom);

  useEffect(() => {
    wasAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useLayoutEffect(() => {
    if (!wasAtBottomRef.current) {
      return;
    }

    const scrollElement = scrollRef.current;

    if (scrollElement) {
      scrollElement.scrollTop = scrollElement.scrollHeight;
    }

    void scrollToBottom();
  }, [composerHeight, scrollRef, scrollToBottom]);

  return null;
}

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
  const [composerHeight, setComposerHeight] = useState(0);
  const composerHeightRef = useRef(composerHeight);

  useEffect(() => {
    composerHeightRef.current = composerHeight;
  }, [composerHeight]);

  const chatStyle = {
    "--chat-composer-height": `${composerHeight}px`,
  } as CSSProperties;
  const handleComposerHeightChange = useCallback((height: number) => {
    if (composerHeightRef.current !== height) {
      setComposerHeight(height);
    }
  }, []);

  return (
    <div
      className="relative flex h-full flex-col overflow-hidden"
      style={chatStyle}
    >
      <Conversation className="relative size-full">
        <ComposerHeightScrollAnchor composerHeight={composerHeight} />
        <InitialThreadScrollInitializer
          enabled={shouldInitializeInitialThreadScroll}
          onReady={handleInitialThreadScrollReady}
        />
        <ConversationContent
          className={cn(
            "pt-0 pb-0 transition-opacity duration-200 ease-out",
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
          <div
            aria-hidden="true"
            className="h-[calc(var(--chat-composer-height)+2rem)] shrink-0"
          />
        </ConversationContent>
        <div className="pointer-events-none absolute inset-x-4 bottom-[var(--chat-composer-height)] flex justify-center">
          <div className="from-card/0 via-card/20 to-card h-8 w-full max-w-3xl bg-gradient-to-b" />
        </div>
        <ConversationScrollButton className="bottom-[calc(var(--chat-composer-height)+1rem)]" />
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
        onComposerHeightChange={handleComposerHeightChange}
      />

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
}
