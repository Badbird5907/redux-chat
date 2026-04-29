import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { toast } from "sonner";
import { estimateTokenCount, splitByTokens } from "tokenx";

import { api } from "@redux/backend/convex/_generated/api";
import {
  CHAT_MODELS,
  getChatModelConfig,
  isFileAllowedForModel,
} from "@redux/shared/models";
import { isToolEnabled } from "@redux/types";
import { useSidebar } from "@redux/ui/components/sidebar";
import { cn } from "@redux/ui/lib/utils";

import type { ChatInputProps, PreviewableFile } from "./types";
import { useSignedCid } from "@/components/chat/client-id";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { useChatDraft } from "@/components/chat/use-chat-draft";
import { submitMessage } from "@/components/chat/use-submit-message";
import { useUpload } from "@/lib/silo/react";
import { ChatInputAttachmentsBar } from "./attachments-bar";
import { ChatInputEditorSection } from "./editor-section";
import { ChatInputToolbar } from "./input-toolbar";
import { ChatToolsDialog } from "./tools-dialog";
import { isAttachmentExpired } from "./utils";

export function ChatInput({
  threadId,
  chatProjectId,
  setThreadId,
  sendMessage,
  setOptimisticMessage,
  messages: _messages,
  status,
  clientId,
  convexMessages,
  settings,
  baselineSettings,
  settingsReady,
  onModelChange,
  onSettingsChange,
  restoreSettings,
}: ChatInputProps) {
  const {
    text: input,
    setText: setInput,
    attachments,
    isReady: draftReady,
    appendAttachment,
    updateAttachment,
    removeAttachment,
    setAttachments,
    clearDraft,
  } = useChatDraft({
    threadId,
    settings,
    baselineSettings,
    settingsReady,
    restoreSettings,
  });
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const [showTokenVisualization, setShowTokenVisualization] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [toolsDialogOpen, setToolsDialogOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visualizationRef = useRef<HTMLDivElement>(null);
  const { allocate: allocateSignedIds } = useSignedCid();
  const { state: sidebarState, collapsible: sidebarCollapsible } = useSidebar();

  const createMessage = useMutation(api.functions.threads.sendMessage);
  const upload = useUpload({
    endpoint: "chatAttachment",
    onError: (error) => {
      toast.error(error.message);
    },
  });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      if (isExpanded) {
        textarea.style.height = "";
        return;
      }

      const previousHeight = textarea.style.height;
      const previousDisplay = textarea.style.display;

      if (showTokenVisualization) {
        textarea.style.display = "block";
        textarea.style.position = "absolute";
        textarea.style.visibility = "hidden";
        textarea.style.height = "auto";
      } else {
        textarea.style.height = "auto";
      }

      const lineHeight = 24;
      const maxHeight = lineHeight * 10;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);

      setTextareaHeight(newHeight);

      if (showTokenVisualization) {
        textarea.style.height = previousHeight;
        textarea.style.display = previousDisplay;
        textarea.style.position = "";
        textarea.style.visibility = "";
      } else {
        textarea.style.height = `${newHeight}px`;
      }
    }
  }, [input, showTokenVisualization, isExpanded]);

  const visualizationHeight = useMemo(() => {
    if (!showTokenVisualization || !textareaHeight) return null;
    const lineHeight = 24;
    const maxHeight = lineHeight * 10;
    return Math.min(textareaHeight, maxHeight);
  }, [showTokenVisualization, textareaHeight]);

  const selectedModel = settings.model;
  const isSearchEnabled = isToolEnabled(settings.tools, "search");
  const isAnalysisWorkspaceEnabled = isToolEnabled(
    settings.tools,
    "analysisWorkspace",
  );
  const syncUploadsToAnalysisWorkspace =
    settings.tools.analysisWorkspace?.syncUploads !== false;
  const showErrorBorder = status === "error";
  const currentModelConfig = getChatModelConfig(selectedModel);
  const acceptedFileTypes = currentModelConfig?.accept.join(",") ?? "";
  const isSubmitting = status === "streaming" || status === "submitted";
  const canUploadFiles =
    !isSubmitting &&
    !!currentModelConfig &&
    currentModelConfig.accept.length > 0 &&
    settingsReady &&
    draftReady;

  const openFilePicker = useCallback(() => {
    if (!canUploadFiles) {
      return;
    }

    setDropdownOpen(false);
    fileInputRef.current?.click();
  }, [canUploadFiles]);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || !currentModelConfig) {
        return;
      }

      for (const file of Array.from(files)) {
        if (!isFileAllowedForModel(selectedModel, file)) {
          toast.error(
            `File type not supported by ${currentModelConfig.name} (${file.type})`,
          );
          continue;
        }

        const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const objectUrl =
          file.type.startsWith("image/") ||
          file.type.startsWith("video/") ||
          file.type.startsWith("audio/") ||
          file.type === "application/pdf"
            ? URL.createObjectURL(file)
            : undefined;

        appendAttachment({
          attachmentId: tempId,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          url: objectUrl,
          uploading: true,
          objectUrl,
        });

        try {
          const completion = await upload.uploadFile(file, {
            input: {
              modelId: selectedModel,
              threadId,
            },
          });

          updateAttachment(tempId, (attachment) => {
            if (attachment.objectUrl) {
              URL.revokeObjectURL(attachment.objectUrl);
            }

            return {
              attachmentId: completion.result.attachmentId,
              fileName: completion.result.fileName,
              mimeType: completion.result.mimeType,
              size: completion.result.size,
              url: completion.result.url,
              uploading: false,
              expiresAt: completion.result.expiresAt,
            };
          });
        } catch (error) {
          setAttachments((previous) => {
            const failedAttachment = previous.find(
              (attachment) => attachment.attachmentId === tempId,
            );
            if (failedAttachment?.objectUrl) {
              URL.revokeObjectURL(failedAttachment.objectUrl);
            }
            return previous.filter(
              (attachment) => attachment.attachmentId !== tempId,
            );
          });

          toast.error(
            error instanceof Error
              ? error.message
              : `Failed to upload ${file.name}`,
          );
        }
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [
      appendAttachment,
      currentModelConfig,
      selectedModel,
      setAttachments,
      threadId,
      updateAttachment,
      upload,
    ],
  );

  const handleRemoveAttachment = useCallback(
    async (attachmentId: string) => {
      try {
        await removeAttachment(attachmentId);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to remove attachment",
        );
      }
    },
    [removeAttachment],
  );

  const handleSearchEnabledChange = useCallback(
    (enabled: boolean) => {
      void onSettingsChange({
        tools: {
          search: enabled ? {} : undefined,
        },
      });
    },
    [onSettingsChange],
  );

  const handleAnalysisWorkspaceEnabledChange = useCallback(
    (enabled: boolean) => {
      void onSettingsChange({
        tools: {
          analysisWorkspace: enabled
            ? (settings.tools.analysisWorkspace ?? { syncUploads: true })
            : undefined,
        },
      });
    },
    [onSettingsChange, settings.tools.analysisWorkspace],
  );

  const handleAnalysisWorkspaceSyncUploadsChange = useCallback(
    (syncUploads: boolean) => {
      if (!isAnalysisWorkspaceEnabled) {
        return;
      }

      void onSettingsChange({
        tools: {
          analysisWorkspace: { syncUploads },
        },
      });
    },
    [isAnalysisWorkspaceEnabled, onSettingsChange],
  );

  const handleSubmit = useCallback(async () => {
    const expiredAttachments = attachments.filter(
      (attachment) =>
        !attachment.uploading && isAttachmentExpired(attachment.expiresAt),
    );
    const currentAttachments = attachments.filter(
      (attachment) =>
        attachment.uploading || !isAttachmentExpired(attachment.expiresAt),
    );

    if (expiredAttachments.length > 0) {
      setAttachments(currentAttachments);
      toast.error(
        expiredAttachments.length === 1
          ? "An attachment expired and was removed."
          : "Some attachments expired and were removed.",
      );
    }

    if (
      (!input.trim() && currentAttachments.length === 0) ||
      status !== "ready"
    ) {
      return;
    }

    if (!settingsReady || !draftReady) {
      return;
    }

    if (attachments.some((attachment) => attachment.uploading)) {
      return;
    }

    if (isExpanded) {
      setIsExpanded(false);
    }

    try {
      await submitMessage({
        messageContent: input,
        threadId,
        chatProjectId,
        setThreadId,
        settings,
        clientId,
        attachmentIds: currentAttachments.map(
          (attachment) => attachment.attachmentId,
        ),
        attachmentMetadata: currentAttachments.map((attachment) => ({
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          expiresAt: attachment.expiresAt,
          url: attachment.url,
        })),
        allocateSignedIds,
        createMessage,
        setOptimisticMessage,
        sendMessage,
        convexMessages,
      });
      clearDraft();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send message",
      );
      console.error("Failed to send message:", error);
    }
  }, [
    attachments,
    chatProjectId,
    clearDraft,
    clientId,
    convexMessages,
    createMessage,
    draftReady,
    input,
    isExpanded,
    allocateSignedIds,
    sendMessage,
    setAttachments,
    setOptimisticMessage,
    setThreadId,
    settings,
    settingsReady,
    status,
    threadId,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === "u") {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) {
          return;
        }
        openFilePicker();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit, openFilePicker],
  );

  useEffect(() => {
    const handleUploadHotkey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.repeat &&
        event.key.toLowerCase() === "u"
      ) {
        event.preventDefault();
        openFilePicker();
      }
    };

    window.addEventListener("keydown", handleUploadHotkey);
    return () => window.removeEventListener("keydown", handleUploadHotkey);
  }, [openFilePicker]);

  const hasUploadingFiles = attachments.some(
    (attachment) => attachment.uploading,
  );
  const hasUsableAttachments = attachments.some(
    (attachment) =>
      !attachment.uploading && !isAttachmentExpired(attachment.expiresAt),
  );

  const tokenCount = useMemo(() => {
    if (!input.trim()) return 0;
    return estimateTokenCount(input);
  }, [input]);

  const tokenizedText = useMemo(() => {
    if (!showTokenVisualization || !input.trim()) return [];
    return splitByTokens(input, 1);
  }, [input, showTokenVisualization]);

  const handleTokenCountClick = useCallback(() => {
    if (input.trim()) {
      setShowTokenVisualization(!showTokenVisualization);
    }
  }, [input, showTokenVisualization]);

  const isContentOverflowing = useMemo(() => {
    if (!textareaHeight) return false;
    const lineHeight = 24;
    const maxHeight = lineHeight * 10;
    return textareaHeight >= maxHeight;
  }, [textareaHeight]);

  const toggleExpand = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const fixedInputDesktopLeft = useMemo(() => {
    if (sidebarState === "expanded") {
      return "md:left-(--sidebar-width)";
    }
    if (sidebarCollapsible === "icon") {
      return "md:left-(--sidebar-width-icon)";
    }
    return "md:left-0";
  }, [sidebarCollapsible, sidebarState]);

  return (
    <>
      {isExpanded && (
        <div
          className="bg-background/80 animate-in fade-in fixed inset-0 z-40 backdrop-blur-sm duration-300"
          onClick={toggleExpand}
        />
      )}
      <div
        className={cn(
          "fixed flex justify-center transition-all duration-300",
          isExpanded
            ? "inset-4 z-50"
            : cn(
                "right-0 bottom-6 left-0 px-4",
                fixedInputDesktopLeft,
              ),
        )}
      >
        <div
          className={cn(
            "w-full transition-all duration-300",
            isExpanded ? "h-full" : "max-w-3xl",
          )}
        >
          <div
            className={cn(
              "bg-card border-border flex flex-col overflow-hidden border shadow-lg transition-all duration-300",
              isExpanded ? "h-full rounded-2xl" : "rounded-3xl",
              status === "streaming" && "border-primary",
              status === "submitted" && "border-amber-400",
              showErrorBorder && "border-destructive",
            )}
          >
            <ChatInputAttachmentsBar
              attachments={attachments}
              onPreview={setPreviewFile}
              onRemove={handleRemoveAttachment}
            />

            <ChatInputEditorSection
              showTokenVisualization={showTokenVisualization}
              isExpanded={isExpanded}
              input={input}
              setInput={setInput}
              textareaRef={textareaRef}
              visualizationRef={visualizationRef}
              visualizationHeight={visualizationHeight}
              tokenizedText={tokenizedText}
              onKeyDown={handleKeyDown}
              isSubmitting={isSubmitting}
              draftReady={draftReady}
              onCloseTokenVisualization={() => setShowTokenVisualization(false)}
            />

            <ChatInputToolbar
              fileInputRef={fileInputRef}
              acceptedFileTypes={acceptedFileTypes}
              onFileChange={handleFileSelect}
              dropdownOpen={dropdownOpen}
              onDropdownOpenChange={setDropdownOpen}
              onOpenFilePicker={openFilePicker}
              onOpenToolsDialog={() => {
                setDropdownOpen(false);
                setToolsDialogOpen(true);
              }}
              canUploadFiles={canUploadFiles}
              isSearchEnabled={isSearchEnabled}
              onToggleSearch={() =>
                handleSearchEnabledChange(!isSearchEnabled)
              }
              settingsReady={settingsReady}
              isContentOverflowing={isContentOverflowing}
              isExpanded={isExpanded}
              onToggleExpand={toggleExpand}
              tokenCount={tokenCount}
              showTokenVisualization={showTokenVisualization}
              onTokenCountClick={handleTokenCountClick}
              models={CHAT_MODELS}
              selectedModel={selectedModel}
              onModelChange={(modelId) => {
                void onModelChange(modelId);
              }}
              input={input}
              hasUsableAttachments={hasUsableAttachments}
              isSubmitting={isSubmitting}
              hasUploadingFiles={hasUploadingFiles}
              draftReady={draftReady}
              onSubmit={() => void handleSubmit()}
              project={chatProjectId}
            />
          </div>
        </div>
      </div>

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />

      <ChatToolsDialog
        isAnalysisWorkspaceEnabled={isAnalysisWorkspaceEnabled}
        isSearchEnabled={isSearchEnabled}
        onAnalysisWorkspaceEnabledChange={handleAnalysisWorkspaceEnabledChange}
        onAnalysisWorkspaceSyncUploadsChange={
          handleAnalysisWorkspaceSyncUploadsChange
        }
        onOpenChange={setToolsDialogOpen}
        onSearchEnabledChange={handleSearchEnabledChange}
        open={toolsDialogOpen}
        settingsReady={settingsReady}
        syncUploads={syncUploadsToAnalysisWorkspace}
      />
    </>
  );
}
