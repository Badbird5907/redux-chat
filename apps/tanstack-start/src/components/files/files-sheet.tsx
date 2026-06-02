import type {
  ChatMessageWithThreadMetadata,
  ResolvedAttachment,
} from "@/components/chat/chat-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { isToolUIPart } from "ai";
import {
  DownloadIcon,
  ExternalLinkIcon,
  ImageIcon,
} from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@redux/ui/components/sheet";
import { cn } from "@redux/ui/lib/utils";

import { getVisibleBranchMessages } from "@/components/chat/chat-branching";
import { toChatUIMessage } from "@/components/chat/chat-message-utils";
import { FileTypeIcon } from "@/components/chat/file-type-icon";
import { requestFilePreview } from "@/components/chat/file-preview-events";
import { useQuery } from "@/lib/hooks/convex";
import { resolveAttachments } from "@/server/attachments";

type BranchScope = "current" | "all";

interface FileEntry {
  key: string;
  fileName: string;
  kind: "image" | "file";
  mimeType?: string;
  url?: string;
  downloadUrl?: string;
  size?: number;
  origin: "attachment" | "model";
  expired?: boolean;
}

interface GeneratedImageLike {
  url?: string;
  downloadUrl?: string;
  mimeType?: string;
  prompt?: string;
  modelId?: string;
}

interface ModelFileLike {
  kind?: "image" | "file";
  url?: string;
  downloadUrl?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}

function getToolOutput(part: unknown): unknown {
  return typeof part === "object" && part !== null && "output" in part
    ? part.output
    : undefined;
}

function asGeneratedImage(part: unknown): GeneratedImageLike | null {
  if (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "data-generated-image"
  ) {
    if ("data" in part) {
      return asGeneratedImage(part.data);
    }
    return part as GeneratedImageLike;
  }
  return null;
}

function asModelFile(part: unknown): ModelFileLike | null {
  if (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "data-model-file"
  ) {
    if ("data" in part && !("fileName" in part)) {
      return asModelFile(part.data);
    }
    return part as ModelFileLike;
  }
  return null;
}

function generatedImageFileName(image: GeneratedImageLike) {
  const slug =
    (image.prompt ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";
  const ext =
    image.mimeType === "image/jpeg"
      ? "jpg"
      : image.mimeType === "image/webp"
        ? "webp"
        : "png";
  return `${slug}.${ext}`;
}

function collectModelFiles(messages: ChatMessageWithThreadMetadata[]) {
  const entries: FileEntry[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    for (const part of message.parts) {
      const image =
        asGeneratedImage(part) ??
        (isToolUIPart(part) ? asGeneratedImage(getToolOutput(part)) : null);
      if (image?.url) {
        const key = image.url;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({
            key,
            fileName: generatedImageFileName(image),
            kind: "image",
            mimeType: image.mimeType,
            url: image.url,
            downloadUrl: image.downloadUrl,
            origin: "model",
          });
        }
        continue;
      }

      const file =
        asModelFile(part) ??
        (isToolUIPart(part) ? asModelFile(getToolOutput(part)) : null);
      if (file?.url && file.fileName) {
        const key = file.url;
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({
            key,
            fileName: file.fileName,
            kind: file.kind === "image" ? "image" : "file",
            mimeType: file.mimeType,
            url: file.url,
            downloadUrl: file.downloadUrl,
            size: file.size,
            origin: "model",
          });
        }
      }
    }
  }

  return entries;
}

function collectAttachmentEntries(
  messages: ChatMessageWithThreadMetadata[],
  resolved: Record<string, ResolvedAttachment>,
) {
  const entries: FileEntry[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      if (seen.has(attachment.attachmentId)) {
        continue;
      }
      seen.add(attachment.attachmentId);
      const detail = resolved[attachment.attachmentId];
      const fileName =
        detail?.originalFileName ??
        detail?.fileName ??
        attachment.originalFileName ??
        attachment.fileName;
      const mimeType = detail?.mimeType ?? attachment.mimeType;
      entries.push({
        key: `attachment:${attachment.attachmentId}`,
        fileName,
        kind: mimeType.startsWith("image/") ? "image" : "file",
        mimeType,
        url: detail?.url ?? attachment.url,
        downloadUrl: detail?.url ?? attachment.url,
        size: detail?.size ?? attachment.size,
        origin: "attachment",
        expired: detail?.expired ?? attachment.expired,
      });
    }
  }

  return entries;
}

function formatFileSize(size: number | undefined) {
  if (!size || size <= 0) {
    return undefined;
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

function FileRow({
  entry,
  onPreview,
}: {
  entry: FileEntry;
  onPreview?: (entry: FileEntry) => void;
}) {
  const subtitle = entry.expired ? "Expired" : formatFileSize(entry.size);
  const clickable = Boolean(onPreview) && Boolean(entry.url) && !entry.expired;

  const details = (
    <>
      <div className="truncate text-sm font-medium" title={entry.fileName}>
        {entry.fileName}
      </div>
      {subtitle ? (
        <div className="text-muted-foreground text-xs">{subtitle}</div>
      ) : null}
    </>
  );

  return (
    <div className="border-border/60 hover:bg-muted/40 flex items-center gap-3 rounded-lg border px-3 py-2">
      {entry.kind === "image" && entry.url ? (
        <img
          src={entry.url}
          alt={entry.fileName}
          className="bg-muted size-10 shrink-0 rounded object-cover"
          loading="lazy"
        />
      ) : (
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded">
          {entry.kind === "image" ? (
            <ImageIcon className="text-muted-foreground size-5" />
          ) : (
            <FileTypeIcon className="size-5" fileName={entry.fileName} />
          )}
        </div>
      )}
      {clickable ? (
        <button
          type="button"
          onClick={() => onPreview?.(entry)}
          className="min-w-0 flex-1 text-left"
        >
          {details}
        </button>
      ) : (
        <div className="min-w-0 flex-1">{details}</div>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <a
          className={cn(
            "hover:bg-muted rounded-md p-1.5",
            !entry.downloadUrl &&
              "text-muted-foreground/40 pointer-events-none",
          )}
          href={entry.downloadUrl ?? undefined}
          download={entry.fileName}
          title="Download"
        >
          <DownloadIcon className="size-4" />
        </a>
        <a
          className={cn(
            "hover:bg-muted rounded-md p-1.5",
            !entry.url && "text-muted-foreground/40 pointer-events-none",
          )}
          href={entry.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          title="Open"
        >
          <ExternalLinkIcon className="size-4" />
        </a>
      </div>
    </div>
  );
}

function FileSection({
  title,
  entries,
  onPreview,
}: {
  title: string;
  entries: FileEntry[];
  onPreview?: (entry: FileEntry) => void;
}) {
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      <div className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {title}
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <FileRow entry={entry} key={entry.key} onPreview={onPreview} />
        ))}
      </div>
    </div>
  );
}

export function FilesSheet({
  threadId,
  open,
  onOpenChange,
}: {
  threadId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [branchScope, setBranchScope] = useState<BranchScope>("current");
  const [resolvedAttachments, setResolvedAttachments] = useState<
    Record<string, ResolvedAttachment>
  >({});
  const resolveAttachmentsFn = useServerFn(resolveAttachments);

  const thread = useQuery(
    api.functions.threads.getThread,
    { threadId },
    { skip: !open },
  );
  const persistedMessages = useQuery(
    api.functions.threads.getThreadMessages,
    { threadId },
    { skip: !open },
  );

  const allMessages = useMemo(
    () => (persistedMessages ?? []).map(toChatUIMessage),
    [persistedMessages],
  );

  const scopedMessages = useMemo(() => {
    if (branchScope === "all") {
      return allMessages;
    }
    return getVisibleBranchMessages(allMessages, thread?.selectedLeafMessageId);
  }, [allMessages, branchScope, thread?.selectedLeafMessageId]);

  const attachmentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const message of allMessages) {
      for (const attachment of message.attachments ?? []) {
        ids.add(attachment.attachmentId);
      }
    }
    return [...ids].sort();
  }, [allMessages]);

  const attachmentIdsKey = attachmentIds.join(",");

  useEffect(() => {
    if (!open || attachmentIds.length === 0) {
      return;
    }

    let cancelled = false;
    void resolveAttachmentsFn({ data: { attachmentIds } })
      .then((attachments) => {
        if (cancelled) {
          return;
        }
        setResolvedAttachments(
          Object.fromEntries(
            attachments.map((attachment) => [
              attachment.attachmentId,
              attachment as ResolvedAttachment,
            ]),
          ),
        );
      })
      .catch((error) => {
        console.error("Failed to resolve attachment URLs", error);
      });

    return () => {
      cancelled = true;
    };
    // attachmentIdsKey captures the contents of attachmentIds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentIdsKey, open, resolveAttachmentsFn]);

  const attachmentEntries = useMemo(
    () => collectAttachmentEntries(scopedMessages, resolvedAttachments),
    [scopedMessages, resolvedAttachments],
  );
  const modelEntries = useMemo(
    () => collectModelFiles(scopedMessages),
    [scopedMessages],
  );

  const isEmpty = attachmentEntries.length === 0 && modelEntries.length === 0;

  const handlePreview = useCallback(
    (entry: FileEntry) => {
      if (!entry.url) {
        return;
      }
      requestFilePreview({
        id: entry.key,
        name: entry.fileName,
        type: entry.mimeType ?? (entry.kind === "image" ? "image/*" : ""),
        url: entry.url,
      });
      onOpenChange(false);
    },
    [onOpenChange],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Files</SheetTitle>
          <SheetDescription>
            Attachments and files generated or presented in this conversation.
          </SheetDescription>
        </SheetHeader>

        <div className="bg-muted text-muted-foreground mx-4 inline-flex w-fit items-center gap-1 rounded-md p-0.5 text-sm">
          <button
            type="button"
            className={cn(
              "rounded px-3 py-1 transition-colors",
              branchScope === "current"
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
            onClick={() => setBranchScope("current")}
          >
            This branch
          </button>
          <button
            type="button"
            className={cn(
              "rounded px-3 py-1 transition-colors",
              branchScope === "all"
                ? "bg-background text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
            onClick={() => setBranchScope("all")}
          >
            All branches
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 pb-6">
          {isEmpty ? (
            <div className="text-muted-foreground flex h-40 items-center justify-center text-center text-sm">
              No files in this conversation yet.
            </div>
          ) : (
            <>
              <FileSection
                title="Attachments"
                entries={attachmentEntries}
                onPreview={handlePreview}
              />
              <FileSection
                title="Generated & presented"
                entries={modelEntries}
                onPreview={handlePreview}
              />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
