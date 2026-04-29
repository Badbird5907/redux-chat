import type { DraftAttachment } from "@/components/chat/use-chat-draft";
import type { LucideIcon } from "lucide-react";
import {
  FileSpreadsheet,
  FileText,
  FileType,
  Image as ImageIcon,
  Loader2,
  Presentation,
  X,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
import { cn } from "@redux/ui/lib/utils";

import type { PreviewableFile } from "./types";
import { isAttachmentExpired } from "./utils";

type AttachmentTileKind =
  | "image"
  | "pdf"
  | "word"
  | "spreadsheet"
  | "presentation"
  | "other";

function fileExtensionLower(name: string): string | undefined {
  const index = name.lastIndexOf(".");
  if (index < 0 || index === name.length - 1) {
    return undefined;
  }
  return name.slice(index + 1).toLowerCase();
}

function classifyAttachmentTile(file: {
  fileName: string;
  mimeType: string;
}): AttachmentTileKind {
  const mime = file.mimeType.toLowerCase();
  const ext = fileExtensionLower(file.fileName);

  if (mime.startsWith("image/")) {
    return "image";
  }

  if (mime === "application/pdf" || ext === "pdf") {
    return "pdf";
  }

  if (
    mime.includes("wordprocessing") ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-word.document.macroenabled.12" ||
    mime === "application/vnd.oasis.opendocument.text" ||
    ext === "doc" ||
    ext === "docx" ||
    ext === "odt" ||
    ext === "rtf"
  ) {
    return "word";
  }

  if (
    mime.includes("spreadsheetml") ||
    mime.includes("ms-excel") ||
    mime === "application/vnd.oasis.opendocument.spreadsheet" ||
    mime === "application/vnd.ms-excel.sheet.macroenabled.12" ||
    ext === "xls" ||
    ext === "xlsx" ||
    ext === "xlsm" ||
    ext === "ods" ||
    ext === "csv"
  ) {
    return "spreadsheet";
  }

  if (
    mime.includes("presentationml") ||
    mime.includes("powerpoint") ||
    mime.includes("officedocument.presentation") ||
    mime === "application/vnd.oasis.opendocument.presentation" ||
    ext === "ppt" ||
    ext === "pptx" ||
    ext === "pptm" ||
    ext === "odp" ||
    ext === "key"
  ) {
    return "presentation";
  }

  return "other";
}

function tileBadgeLabel(kind: AttachmentTileKind, ext: string | undefined) {
  if (kind === "pdf") {
    return "PDF";
  }
  if (ext) {
    const upper = ext.toUpperCase();
    return upper.length <= 5 ? upper : `${upper.slice(0, 4)}…`;
  }
  return "FILE";
}

const DOCUMENT_TILE_STYLES: Record<
  Exclude<AttachmentTileKind, "image">,
  string
> = {
  pdf: "bg-rose-500/12 text-rose-800 dark:text-rose-300",
  word: "bg-sky-500/12 text-sky-900 dark:text-sky-300",
  spreadsheet: "bg-emerald-500/12 text-emerald-900 dark:text-emerald-300",
  presentation: "bg-amber-500/12 text-amber-950 dark:text-amber-300",
  other: "bg-muted/80 text-muted-foreground",
};

function tileIconForKind(kind: AttachmentTileKind): LucideIcon {
  switch (kind) {
    case "image":
      return ImageIcon;
    case "pdf":
      return FileType;
    case "spreadsheet":
      return FileSpreadsheet;
    case "presentation":
      return Presentation;
    case "word":
    case "other":
      return FileText;
    default:
      return FileText;
  }
}

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

  // TODO: in the future once the model selector is implemented
  // show a badge for files that may need to be converted etc
  return (
    <div className="flex flex-wrap gap-2 px-4 pt-3">
      {attachments.map((file) => {
        const kind = classifyAttachmentTile(file);
        const isImage = kind === "image";
        const isExpired = isAttachmentExpired(file.expiresAt);
        const ext = fileExtensionLower(file.fileName);
        const badge = tileBadgeLabel(kind, ext);
        const Icon = tileIconForKind(kind);
        const docTileClass =
          kind !== "image" ? DOCUMENT_TILE_STYLES[kind] : undefined;
        return (
          <div key={file.attachmentId} className="group relative">
            <Tooltip delay={300}>
              <TooltipTrigger>
                <span className="inline-flex h-16 w-16">
                  <button
                    type="button"
                    aria-label={`Preview attachment ${file.fileName}`}
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
                    className="border-border bg-muted hover:border-primary relative h-full w-full overflow-hidden rounded-lg border transition-colors"
                    disabled={file.uploading || isExpired}
                  >
                    {isImage && file.url && !isExpired ? (
                      <img
                        src={file.url}
                        alt={file.fileName}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div
                        className={cn(
                          "flex h-full w-full flex-col items-center justify-center gap-1 p-1.5",
                          docTileClass,
                        )}
                      >
                        <Icon
                          className="h-[22px] w-[22px] shrink-0 opacity-90"
                          aria-hidden
                        />
                        <span className="max-w-full truncate px-px text-[9px] leading-none font-semibold tracking-wide">
                          {badge}
                        </span>
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
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-[min(20rem,calc(100vw-3rem))] px-3 py-1.5 text-left"
              >
                <span className="block wrap-break-word">{file.fileName}</span>
              </TooltipContent>
            </Tooltip>
            {!file.uploading && (
              <button
                type="button"
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
