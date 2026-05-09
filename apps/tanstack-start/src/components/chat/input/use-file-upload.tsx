import type { DraftAttachment } from "@/components/chat/use-chat-draft";
import type React from "react";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import type { ChatModelConfig } from "@redux/shared/models";
import { isFileAllowedForModel } from "@redux/shared/models";

import { useUpload } from "@/lib/silo/react";

function extractPastedFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }

  const fromFiles = Array.from(data.files);
  if (fromFiles.length > 0) {
    return fromFiles;
  }

  const out: File[] = [];
  for (const item of data.items) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) {
        out.push(file);
      }
    }
  }

  return out;
}

function ChatFileDropHighlightOverlay() {
  return (
    <div
      className="bg-background/55 animate-in fade-in pointer-events-none fixed inset-0 z-100 flex items-center justify-center backdrop-blur-sm duration-200"
      aria-hidden
    >
      <div className="border-primary/70 bg-card/95 text-foreground flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-12 py-10 text-center shadow-xl">
        <Upload
          className="text-primary size-12"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-lg font-medium">Drop files to attach</p>
        <p className="text-muted-foreground text-sm">
          Release to add them to your message
        </p>
      </div>
    </div>
  );
}

export interface UseFileUploadParams {
  threadId?: string;
  selectedModel: string;
  currentModelConfig: ChatModelConfig | undefined;
  canUploadFiles: boolean;
  appendAttachment: (attachment: DraftAttachment) => void;
  updateAttachment: (
    attachmentId: string,
    updater: (attachment: DraftAttachment) => DraftAttachment,
  ) => void;
  setAttachments: Dispatch<SetStateAction<DraftAttachment[]>>;
  beforeOpenFilePicker?: () => void;
  attachmentLimits?: { maxPerMessage: number; maxFileSizeBytes: number } | null;
  currentAttachmentCount?: number;
}

export function useFileUpload({
  threadId,
  selectedModel,
  currentModelConfig,
  canUploadFiles,
  appendAttachment,
  updateAttachment,
  setAttachments,
  beforeOpenFilePicker,
  attachmentLimits,
  currentAttachmentCount,
}: UseFileUploadParams) {
  const [fileDragHighlight, setFileDragHighlight] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = useUpload({
    endpoint: "chatAttachment",
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const uploadChatFiles = useCallback(
    async (fileList: readonly File[]) => {
      if (!currentModelConfig) {
        return;
      }

      const remainingSlots = attachmentLimits
        ? Math.max(0, attachmentLimits.maxPerMessage - (currentAttachmentCount ?? 0))
        : Infinity;
      let addedInBatch = 0;

      for (const file of fileList) {
        if (attachmentLimits && addedInBatch >= remainingSlots) {
          toast.error(
            `Free plan allows only ${attachmentLimits.maxPerMessage} attachment per message. Upgrade for more.`,
          );
          break;
        }

        if (attachmentLimits && file.size > attachmentLimits.maxFileSizeBytes) {
          const maxMB = attachmentLimits.maxFileSizeBytes / (1024 * 1024);
          toast.error(
            `"${file.name}" exceeds the ${maxMB} MB limit on the free plan. Upgrade to attach larger files.`,
          );
          continue;
        }

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

        addedInBatch++;
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
          console.log("uploading file", file);
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
    },
    [
      appendAttachment,
      attachmentLimits,
      currentAttachmentCount,
      currentModelConfig,
      selectedModel,
      setAttachments,
      threadId,
      updateAttachment,
      upload,
    ],
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files?.length) {
        return;
      }

      await uploadChatFiles(Array.from(files));

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [uploadChatFiles],
  );

  const handlePasteFiles = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!canUploadFiles) {
        return;
      }

      const files = extractPastedFiles(e.clipboardData);
      if (files.length === 0) {
        return;
      }

      e.preventDefault();
      void uploadChatFiles(files);
    },
    [canUploadFiles, uploadChatFiles],
  );

  const openFilePicker = useCallback(() => {
    if (!canUploadFiles) {
      return;
    }

    beforeOpenFilePicker?.();
    fileInputRef.current?.click();
  }, [beforeOpenFilePicker, canUploadFiles]);

  useEffect(() => {
    const dragHasFiles = (dt: DataTransfer | null) => {
      if (!dt) {
        return false;
      }
      return Array.from(dt.types).includes("Files");
    };

    const onDragEnter = (e: DragEvent) => {
      if (!canUploadFiles || !dragHasFiles(e.dataTransfer)) {
        return;
      }

      setFileDragHighlight(true);
    };

    const onDragLeave = (e: DragEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && document.contains(related)) {
        return;
      }

      setFileDragHighlight(false);
    };

    const onDragOver = (e: DragEvent) => {
      if (!canUploadFiles || !dragHasFiles(e.dataTransfer)) {
        return;
      }

      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const onDrop = (e: DragEvent) => {
      setFileDragHighlight(false);

      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input[type="file"]')
      ) {
        return;
      }

      if (!canUploadFiles) {
        return;
      }

      if (!dragHasFiles(e.dataTransfer)) {
        return;
      }

      const files = e.dataTransfer?.files;
      if (!files?.length) {
        return;
      }

      e.preventDefault();
      void uploadChatFiles(Array.from(files));
    };

    document.addEventListener("dragenter", onDragEnter);
    document.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);

    return () => {
      document.removeEventListener("dragenter", onDragEnter);
      document.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [canUploadFiles, uploadChatFiles]);

  const dropHighlightLayer = useMemo(
    () =>
      fileDragHighlight && canUploadFiles ? (
        <ChatFileDropHighlightOverlay />
      ) : null,
    [canUploadFiles, fileDragHighlight],
  );

  return {
    fileInputRef,
    handleFileSelect,
    handlePasteFiles,
    openFilePicker,
    dropHighlightLayer,
  };
}
