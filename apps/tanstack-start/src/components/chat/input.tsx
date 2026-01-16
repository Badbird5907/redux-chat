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
import { estimateTokenCount, splitByTokens } from "tokenx";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import { cn } from "@redux/ui/lib/utils";

import { useSignedCid } from "@/components/chat/client-id";
import { uploadFile } from "@/components/chat/dummy";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { ModelSelector } from "@/components/chat/model-selector";
import { submitMessage } from "@/components/chat/use-submit-message";
import { getModelConfig, MODELS } from "@/lib/model-config";

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  uploading: boolean;
  url?: string;
}

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
  clientId: string; // Client session ID to identify the initiating client
  parentMessageId?: string; // Last message in the current branch path
}

export function ChatInput({
  threadId,
  setThreadId,
  sendMessage,
  setOptimisticMessage,
  messages: _messages,
  status,
  clientId,
  parentMessageId,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const [selectedModel, setSelectedModel] = useState(MODELS[0]?.id ?? "gpt-4o");
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null);
  const [isSearchEnabled, setIsSearchEnabled] = useState(false);
  const [showTokenVisualization, setShowTokenVisualization] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number | null>(null);
  const [showErrorBorder, setShowErrorBorder] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visualizationRef = useRef<HTMLDivElement>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { safeGetSignedId } = useSignedCid();

  const createMessage = useMutation(api.functions.threads.sendMessage);

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
      // this is intended
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const modelConfig = getModelConfig(selectedModel);
      if (!modelConfig) return;

      for (const file of Array.from(files)) {
        const isAllowed = modelConfig.allowedFileTypes.some((allowedType) => {
          if (allowedType.startsWith(".")) {
            return file.name.toLowerCase().endsWith(allowedType.toLowerCase());
          }
          if (allowedType.includes("*")) {
            const [type] = allowedType.split("/");
            return type ? file.type.startsWith(type) : false;
          }
          return file.type === allowedType;
        });

        if (!isAllowed && modelConfig.allowedFileTypes.length > 0) {
          alert(`File type not supported by ${modelConfig.name}`);
          continue;
        }

        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(7)}`; // TODO

        const url =
          file.type.startsWith("image/") ||
          file.type.startsWith("video/") ||
          file.type.startsWith("audio/") ||
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf")
            ? URL.createObjectURL(file)
            : undefined;

        setAttachments((prev) => [
          ...prev,
          {
            id: tempId,
            name: file.name,
            type: file.type,
            uploading: true,
            url,
          },
        ]);

        try {
          const fileId = await uploadFile(file);
          setAttachments((prev) =>
            prev.map((f) =>
              f.id === tempId ? { ...f, id: fileId, uploading: false } : f,
            ),
          );
        } catch {
          setAttachments((prev) => prev.filter((f) => f.id !== tempId));
          if (url) URL.revokeObjectURL(url);
        }
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [selectedModel],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.url) URL.revokeObjectURL(file.url);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  // Cleanup object URLs on unmount
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((file) => {
        if (file.url) URL.revokeObjectURL(file.url);
      });
    };
  }, []);

  const handleSubmit = useCallback(async () => {
    if ((!input.trim() && attachments.length === 0) || status !== "ready")
      return;

    if (attachments.some((f) => f.uploading)) return;

    if (isExpanded) {
      setIsExpanded(false);
    }

    // Capture input before clearing
    const messageContent = input;
    const currentAttachments = [...attachments];

    // Clear input immediately - user feels the responsiveness
    setInput("");
    setAttachments([]);
    currentAttachments.forEach((file) => {
      if (file.url) URL.revokeObjectURL(file.url);
    });

    const fileIds = currentAttachments.map((f) => f.id);

    await submitMessage({
      messageContent,
      threadId,
      setThreadId,
      selectedModel,
      clientId,
      fileIds,
      parentMessageId,
      safeGetSignedId,
      createMessage,
      setOptimisticMessage,
      sendMessage,
    });
  }, [
    input,
    attachments,
    status,
    isExpanded,
    threadId,
    setOptimisticMessage,
    selectedModel,
    sendMessage,
    safeGetSignedId,
    createMessage,
    setThreadId,
    clientId,
    parentMessageId,
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
  const hasUploadingFiles = attachments.some((f) => f.uploading);
  const currentModelConfig = getModelConfig(selectedModel);
  const acceptedFileTypes =
    currentModelConfig?.allowedFileTypes.join(",") ?? "";

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
                  const isImage = file.type.startsWith("image/");
                  return (
                    <div key={file.id} className="group relative">
                      <button
                        onClick={() => !file.uploading && setPreviewFile(file)}
                        className="border-border bg-muted hover:border-primary block h-16 w-16 overflow-hidden rounded-lg border transition-colors"
                        disabled={file.uploading}
                      >
                        {isImage && file.url ? (
                          <img
                            src={file.url || "/placeholder.svg"}
                            alt={file.name}
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
                          onClick={() => removeAttachment(file.id)}
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

                    // Check if token contains or is a newline
                    const hasNewline = token.includes("\n");

                    if (hasNewline) {
                      // Split by newlines and render each part
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
                  disabled={isSubmitting}
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
                    currentModelConfig.allowedFileTypes.length === 0
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
                      ? "bg-primary/10 border-primary/10 text-primary-foreground hover:bg-primary/20"
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
                  onModelChange={setSelectedModel}
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
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting ||
                    hasUploadingFiles ||
                    (!input.trim() && attachments.length === 0)
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
