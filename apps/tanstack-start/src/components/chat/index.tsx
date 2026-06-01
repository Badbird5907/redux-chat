"use client";

import type { ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { cn } from "@redux/ui/lib/utils";

import type { ChatPreload } from "./preload";
import type { ThreadExportInput } from "./thread-export-utils";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { ChatMessageList } from "./chat-message-list";
import { InitialThreadScrollInitializer } from "./initial-thread-scroll-initializer";
import { ChatInput } from "./input";
import { ThreadPrintExport } from "./thread-export";
import { REQUEST_THREAD_PDF_EXPORT_EVENT } from "./thread-export-utils";
import { useChatSession } from "./use-chat-session";

async function waitForPrintableImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map((image) => {
      if (image.complete) {
        return Promise.resolve();
      }

      return new Promise<void>((resolve) => {
        image.onload = () => resolve();
        image.onerror = () => resolve();
      });
    }),
  );
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });
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
  const [printExportInput, setPrintExportInput] =
    useState<ThreadExportInput | null>(null);
  const printRootRef = useRef<HTMLDivElement | null>(null);
  const printInProgressRef = useRef(false);
  const {
    currentThreadId,
    currentThreadName,
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

  const startPdfExport = useCallback((input: ThreadExportInput) => {
    setPrintExportInput(input);
  }, []);
  const startPdfExportEvent = useEffectEvent(startPdfExport);

  useEffect(() => {
    const handlePdfExportRequest = (event: Event) => {
      const customEvent = event as CustomEvent<ThreadExportInput>;
      startPdfExportEvent(customEvent.detail);
    };

    window.addEventListener(
      REQUEST_THREAD_PDF_EXPORT_EVENT,
      handlePdfExportRequest,
    );

    return () => {
      window.removeEventListener(
        REQUEST_THREAD_PDF_EXPORT_EVENT,
        handlePdfExportRequest,
      );
    };
  }, []);

  useEffect(() => {
    const handlePrintHotkey = (event: KeyboardEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== "p"
      ) {
        return;
      }

      if (!currentThreadId) {
        return;
      }

      event.preventDefault();
      startPdfExportEvent({
        threadId: currentThreadId,
        threadName: currentThreadName ?? "Thread",
        messages: finalMessages,
        resolvedAttachments: resolvedMessageAttachments,
      });
    };

    window.addEventListener("keydown", handlePrintHotkey);

    return () => {
      window.removeEventListener("keydown", handlePrintHotkey);
    };
  }, [
    currentThreadId,
    currentThreadName,
    finalMessages,
    resolvedMessageAttachments,
  ]);

  useEffect(() => {
    if (!printExportInput || printInProgressRef.current) {
      return;
    }

    let cleanupTimer: number | undefined;
    let cancelled = false;

    const cleanup = () => {
      if (cancelled) {
        return;
      }

      cancelled = true;
      window.clearTimeout(cleanupTimer);
      window.removeEventListener("afterprint", cleanup);
      document.body.classList.remove("thread-export-printing");
      printInProgressRef.current = false;
      setPrintExportInput(null);
    };

    async function printExport() {
      const printRoot = printRootRef.current;
      if (!printRoot) {
        cleanup();
        toast.error("Failed to prepare PDF export");
        return;
      }

      try {
        printInProgressRef.current = true;
        document.body.classList.add("thread-export-printing");
        window.addEventListener("afterprint", cleanup);

        await waitForNextFrame();
        await Promise.all([
          waitForNextFrame(),
          document.fonts.ready,
          waitForPrintableImages(printRoot),
        ]);

        if (cancelled) {
          return;
        }

        window.print();
        cleanupTimer = window.setTimeout(cleanup, 60_000);
      } catch (error) {
        cleanup();
        toast.error(
          error instanceof Error ? error.message : "Failed to export thread",
        );
      }
    }

    void printExport();

    return cleanup;
  }, [printExportInput]);

  return (
    <>
      <div className="flex h-full flex-col overflow-hidden print:hidden">
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
      {printExportInput
        ? createPortal(
            <ThreadPrintExport
              input={printExportInput}
              printRootRef={printRootRef}
            />,
            document.body,
          )
        : null}
    </>
  );
}
