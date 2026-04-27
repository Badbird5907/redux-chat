import { FileText, Loader2, X } from "lucide-react";

import type { DraftAttachment } from "@/components/chat/use-chat-draft";

import type { PreviewableFile } from "./types";
import { isAttachmentExpired } from "./utils";

interface ChatInputAttachmentsBarProps {
  attachments: DraftAttachment[];
  onPreview: (file: PreviewableFile) => void;
  onRemove: (attachmentId: string) => void;
}

export function ChatInputAttachmentsBar({
  attachments,
  onPreview,
  onRemove,
}: ChatInputAttachmentsBarProps) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3">
      {attachments.map((file) => {
        const isImage = file.mimeType.startsWith("image/");
        const isExpired = isAttachmentExpired(file.expiresAt);
        return (
          <div key={file.attachmentId} className="group relative">
            <button
              onClick={() =>
                !file.uploading &&
                !isExpired &&
                onPreview({
                  id: file.attachmentId,
                  name: file.fileName,
                  type: file.mimeType,
                  url: file.url,
                })
              }
              className="border-border bg-muted hover:border-primary block h-16 w-16 overflow-hidden rounded-lg border transition-colors"
              disabled={file.uploading || isExpired}
            >
              {isImage && file.url && !isExpired ? (
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
              {isExpired && !file.uploading && (
                <div className="bg-background/85 text-muted-foreground absolute inset-0 flex items-center justify-center text-[10px] font-medium">
                  Expired
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
                onClick={() => void onRemove(file.attachmentId)}
                className="bg-background border-border hover:bg-muted absolute -top-1.5 -right-1.5 rounded-full border p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="text-muted-foreground h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
