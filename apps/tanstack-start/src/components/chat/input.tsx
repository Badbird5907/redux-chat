import type { UIMessage } from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  ArrowUp,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { estimateTokenCount, splitByTokens } from "tokenx";

import type { MessageSettings } from "@redux/types";
import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { cn } from "@redux/ui/lib/utils";

import { useSignedCid } from "@/components/chat/client-id";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { ModelSelector } from "@/components/chat/model-selector";
import { useChatDraft } from "@/components/chat/use-chat-draft";
import { submitMessage } from "@/components/chat/use-submit-message";
import {
  getChatModelConfig,
  isFileAllowedForModel,
  MODELS,
} from "@/lib/model-config";
import { useUpload } from "@/lib/silo/react";

interface ChatInputProps {
  threadId?: string;
  setThreadId: (threadId: string) => void;
  sendMessage: (
    message: { text: string; id?: string; metadata?: Record<string, unknown> },
    options?: { body?: object },
  ) => void;
  setOptimisticMessage: (message: UIMessage | undefined) => void;
  messages: UIMessage[];
  status: "ready" | "streaming" | "submitted" | "error";
  clientId: string;
  convexMessages: UIMessage[];
  settings: MessageSettings;
  settingsReady: boolean;
  onModelChange: (modelId: string) => Promise<MessageSettings>;
}

interface PreviewableFile {
  id: string;
  name: string;
  type: string;
  url?: string;
}

export function ChatInput({
  threadId,
  setThreadId,
  sendMessage,
  setOptimisticMessage,
  messages: _messages,
  status,
  clientId,
  convexMessages,
  settings,
  settingsReady,
  onModelChange,
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
  } = useChatDraft(threadId);
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const [showTokenVisualization, setShowTokenVisualization] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number | null>(null);
  const [showErrorBorder, setShowErrorBorder] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visualizationRef = useRef<HTMLDivElement>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { allocate: allocateSignedIds } = useSignedCid();

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

  useEffect(() => {
    if (status === "error") {
      setShowErrorBorder(true);

      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }

      errorTimeoutRef.current = setTimeout(() => {
        setShowErrorBorder(false);
      }, 10000);
    }

    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, [status]);

  const visualizationHeight = useMemo(() => {
    if (!showTokenVisualization || !textareaHeight) return null;
    const lineHeight = 24;
    const maxHeight = lineHeight * 10;
    return Math.min(textareaHeight, maxHeight);
  }, [showTokenVisualization, textareaHeight]);

  const selectedModel = settings.model;
  const currentModelConfig = getChatModelConfig(selectedModel);
  const acceptedFileTypes = currentModelConfig?.accept.join(",") ?? "";

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || !currentModelConfig) {
        return;
      }

      for (const file of Array.from(files)) {
        if (!isFileAllowedForModel(selectedModel, file)) {
          toast.error(`File type not supported by ${currentModelConfig.name}`);
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

  const handleSubmit = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || status !== "ready") {
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

    const currentAttachments = [...attachments];

    try {
      await submitMessage({
        messageContent: input,
        threadId,
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
    clearDraft,
    clientId,
    convexMessages,
    createMessage,
    draftReady,
    input,
    isExpanded,
    allocateSignedIds,
    sendMessage,
    setOptimisticMessage,
    setThreadId,
    settings,
    settingsReady,
    status,
    threadId,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const isSubmitting = status === "streaming" || status === "submitted";
  const hasUploadingFiles = attachments.some(
    (attachment) => attachment.uploading,
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
            : "right-0 bottom-6 left-0 px-4 md:left-(--sidebar-width) md:group-data-[collapsible=icon]/sidebar-wrapper:left-(--sidebar-width-icon)",
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
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 pt-3">
                {attachments.map((file) => {
                  const isImage = file.mimeType.startsWith("image/");
                  return (
                    <div key={file.attachmentId} className="group relative">
                      <button
                        onClick={() =>
                          !file.uploading &&
                          setPreviewFile({
                            id: file.attachmentId,
                            name: file.fileName,
                            type: file.mimeType,
                            url: file.url,
                          })
                        }
                        className="border-border bg-muted hover:border-primary block h-16 w-16 overflow-hidden rounded-lg border transition-colors"
                        disabled={file.uploading}
                      >
                        {isImage && file.url ? (
                          <img
                            src={file.url}
                            alt={file.fileName}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <FileText className="text-muted-foreground h-6 w-6" />
                          </div>
                        )}
                        {file.uploading && (
                          <div className="bg-background/80 absolute inset-0 flex items-center justify-center">
                            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                          </div>
                        )}
                      </button>
                      {!file.uploading && (
                        <button
                          onClick={() =>
                            void handleRemoveAttachment(file.attachmentId)
                          }
                          className="bg-background border-border hover:bg-muted absolute -top-1.5 -right-1.5 rounded-full border p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="text-muted-foreground h-3 w-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div
              className={cn(
                "px-4 pt-3 pb-2",
                isExpanded && "flex flex-1 flex-col overflow-hidden",
              )}
            >
              {showTokenVisualization ? (
                <div
                  ref={visualizationRef}
                  className={cn(
                    "w-full cursor-pointer overflow-y-auto text-base leading-6 wrap-break-word whitespace-pre-wrap",
                    isExpanded && "flex-1",
                  )}
                  style={
                    isExpanded
                      ? undefined
                      : {
                          height: visualizationHeight
                            ? `${visualizationHeight}px`
                            : "24px",
                          maxHeight: `${24 * 10}px`,
                          minHeight: "24px",
                        }
                  }
                  onClick={() => setShowTokenVisualization(false)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setShowTokenVisualization(false);
                    }
                  }}
                >
                  {tokenizedText.map((token, index) => {
                    const colors = [
                      "bg-red-200 dark:bg-red-900/30",
                      "bg-blue-200 dark:bg-blue-900/30",
                      "bg-green-200 dark:bg-green-900/30",
                      "bg-yellow-200 dark:bg-yellow-900/30",
                      "bg-purple-200 dark:bg-purple-900/30",
                      "bg-pink-200 dark:bg-pink-900/30",
                      "bg-indigo-200 dark:bg-indigo-900/30",
                      "bg-orange-200 dark:bg-orange-900/30",
                      "bg-teal-200 dark:bg-teal-900/30",
                      "bg-cyan-200 dark:bg-cyan-900/30",
                    ];
                    const colorClass = colors[index % colors.length];
                    const hasNewline = token.includes("\n");

                    if (hasNewline) {
                      const parts = token.split("\n");
                      return (
                        <span key={index}>
                          {parts.map((part, partIndex) => (
                            <span key={`${index}-${partIndex}`}>
                              {part && (
                                <span
                                  className={cn(
                                    "inline-block rounded px-0.5",
                                    colorClass,
                                  )}
                                >
                                  {part}
                                </span>
                              )}
                              {partIndex < parts.length - 1 && (
                                <>
                                  <span
                                    className={cn(
                                      "inline-block rounded px-1 font-mono text-xs",
                                      colorClass,
                                      "opacity-70",
                                    )}
                                    title="Newline"
                                  >
                                    ↵
                                  </span>
                                  <br />
                                </>
                              )}
                            </span>
                          ))}
                        </span>
                      );
                    }

                    return (
                      <span
                        key={index}
                        className={cn(
                          "inline-block rounded px-0.5",
                          colorClass,
                        )}
                      >
                        {token}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Message..."
                  rows={1}
                  className={cn(
                    "text-foreground placeholder:text-muted-foreground w-full resize-none bg-transparent text-base leading-6 focus:outline-none",
                    isExpanded && "flex-1",
                  )}
                  style={isExpanded ? undefined : { maxHeight: `${24 * 10}px` }}
                  disabled={isSubmitting || !draftReady}
                />
              )}
            </div>

            <div className="flex items-center justify-between px-2 pb-2">
              <div className="flex items-center gap-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={acceptedFileTypes}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 rounded-full"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={
                    isSubmitting ||
                    !currentModelConfig ||
                    currentModelConfig.accept.length === 0 ||
                    !settingsReady ||
                    !draftReady
                  }
                >
                  <Plus className="h-5 w-5" />
                </Button>

                <button
                  type="button"
                  onClick={() => setIsSearchEnabled(!isSearchEnabled)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                    isSearchEnabled
                      ? "bg-primary/60 border-primary/90 text-primary-foreground hover:bg-primary/20"
                      : "hover:bg-muted/80 text-foreground border-border bg-none",
                  )}
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {isContentOverflowing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 rounded-full"
                    onClick={toggleExpand}
                    title={isExpanded ? "Collapse" : "Expand"}
                  >
                    {isExpanded ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {tokenCount > 0 && (
                  <button
                    type="button"
                    onClick={handleTokenCountClick}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs tabular-nums transition-colors",
                      showTokenVisualization
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                    title="Click to visualize tokens"
                  >
                    {tokenCount.toLocaleString()} tokens
                  </button>
                )}
                <ModelSelector
                  models={MODELS}
                  selectedModel={selectedModel}
                  onModelChange={(modelId) => {
                    void onModelChange(modelId);
                  }}
                />
                <Button
                  type="button"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-full transition-all",
                    input.trim() || attachments.length > 0
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "bg-muted text-muted-foreground",
                  )}
                  onClick={() => void handleSubmit()}
                  disabled={
                    isSubmitting ||
                    hasUploadingFiles ||
                    (!input.trim() && attachments.length === 0) ||
                    !settingsReady ||
                    !draftReady
                  }
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </>
  );
}
