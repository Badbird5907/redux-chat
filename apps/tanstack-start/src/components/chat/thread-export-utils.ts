import type { UIMessage } from "ai";
import { isTextUIPart, isToolUIPart } from "ai";

import type {
  ChatMessageWithThreadMetadata,
  MessageAttachmentSummary,
  ResolvedAttachment,
} from "./chat-types";
import {
  attachmentDisplayName,
  isAttachmentExpired,
} from "./chat-message-utils";

export const REQUEST_THREAD_PDF_EXPORT_EVENT =
  "redux-chat:request-thread-pdf-export";

export interface ThreadExportInput {
  threadId: string;
  threadName: string;
  messages: ChatMessageWithThreadMetadata[];
  resolvedAttachments?: Record<string, ResolvedAttachment>;
}

interface GeneratedImagePart {
  type: "data-generated-image";
  url?: string;
  downloadUrl?: string;
  mimeType?: string;
  prompt: string;
  modelId: string;
  provider?: string;
  createdAt?: number;
  status?: "generating" | "generated";
}

const MARKDOWN_IMAGE_RE = /!\[[^\]]*]\(\s*<?([^)>\s]+)>?(?:\s+"[^"]*")?\)/g;

function sanitizeFileName(value: string) {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "-")
      .replace(/./g, (char) => (char.charCodeAt(0) < 32 ? "-" : char))
      .replace(/\s+/g, " ")
      .slice(0, 80) || "thread"
  );
}

function escapeMarkdown(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}

function normalizeGeneratedImagePart(part: unknown): GeneratedImagePart | null {
  if (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "data-generated-image" &&
    "prompt" in part &&
    typeof part.prompt === "string" &&
    "modelId" in part &&
    typeof part.modelId === "string"
  ) {
    return part as GeneratedImagePart;
  }

  if (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "data-generated-image" &&
    "data" in part
  ) {
    return normalizeGeneratedImagePart(part.data);
  }

  return null;
}

function getToolOutput(part: unknown): unknown {
  return typeof part === "object" && part !== null && "output" in part
    ? part.output
    : undefined;
}

function getGeneratedImageKey(image: GeneratedImagePart) {
  return image.url ?? `${image.modelId}:${image.prompt}`;
}

export function getMessageText(message: Pick<UIMessage, "parts">) {
  return message.parts
    .flatMap((part) =>
      isTextUIPart(part) && typeof part.text === "string" ? [part.text] : [],
    )
    .join("");
}

function getGeneratedImages(message: Pick<UIMessage, "parts">) {
  const images = new Map<string, GeneratedImagePart>();

  for (const part of message.parts) {
    const directImage = normalizeGeneratedImagePart(part);
    if (directImage?.url && directImage.status !== "generating") {
      images.set(getGeneratedImageKey(directImage), directImage);
    }

    const toolImage = isToolUIPart(part)
      ? normalizeGeneratedImagePart(getToolOutput(part))
      : undefined;
    if (toolImage?.url && toolImage.status !== "generating") {
      images.set(getGeneratedImageKey(toolImage), toolImage);
    }
  }

  return [...images.values()];
}

function getMessageAttachments(
  message: ChatMessageWithThreadMetadata,
  resolvedAttachments: Record<string, ResolvedAttachment>,
) {
  const persistedAttachments = message.attachments ?? [];
  const metadata = ("metadata" in message ? message.metadata : undefined) as
    | { attachments?: MessageAttachmentSummary[] }
    | undefined;
  const attachments =
    persistedAttachments.length > 0
      ? persistedAttachments
      : (metadata?.attachments ?? []);

  return attachments.map((attachment) => {
    const resolved = resolvedAttachments[attachment.attachmentId];
    return {
      ...attachment,
      fileName: resolved?.fileName ?? attachment.fileName,
      originalFileName:
        resolved?.originalFileName ?? attachment.originalFileName,
      mimeType: resolved?.mimeType ?? attachment.mimeType,
      size: resolved?.size ?? attachment.size,
      expiresAt: resolved?.expiresAt ?? attachment.expiresAt,
      expired:
        resolved?.expired ??
        attachment.expired ??
        isAttachmentExpired(attachment.expiresAt),
      url: resolved?.url ?? attachment.url,
    };
  });
}

function buildMarkdown(input: ThreadExportInput) {
  const resolvedAttachments = input.resolvedAttachments ?? {};
  const lines: string[] = [
    `# ${input.threadName}`,
    "",
    `Thread ID: ${input.threadId}`,
    `Exported: ${new Date().toLocaleString()}`,
    "",
  ];

  for (const message of input.messages) {
    const label =
      message.role === "assistant"
        ? "Assistant"
        : message.role === "user"
          ? "User"
          : "System";
    const text = getMessageText(message).trim();

    lines.push(`## ${label}`, "");
    if (text) {
      lines.push(text, "");
    }

    for (const attachment of getMessageAttachments(
      message,
      resolvedAttachments,
    )) {
      if (!attachment.url || attachment.expired) {
        continue;
      }

      const name = attachmentDisplayName(attachment);
      if (attachment.mimeType.startsWith("image/")) {
        lines.push(`![${escapeMarkdown(name)}](<${attachment.url}>)`, "");
      } else {
        lines.push(`[${escapeMarkdown(name)}](${attachment.url})`, "");
      }
    }

    const textImageUrls = new Set<string>();
    for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
      if (match[1]) {
        textImageUrls.add(match[1]);
      }
    }

    for (const image of getGeneratedImages(message)) {
      if (!image.url || textImageUrls.has(image.url)) {
        continue;
      }
      lines.push(`![${escapeMarkdown(image.prompt)}](<${image.url}>)`, "");
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

function downloadTextFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export function exportThreadMarkdown(input: ThreadExportInput) {
  downloadTextFile(
    `${sanitizeFileName(input.threadName)}.md`,
    buildMarkdown(input),
    "text/markdown;charset=utf-8",
  );
}

export function requestThreadPdfExport(input: ThreadExportInput) {
  window.dispatchEvent(
    new CustomEvent<ThreadExportInput>(REQUEST_THREAD_PDF_EXPORT_EVENT, {
      detail: input,
    }),
  );
}

export function getImageUrlsForMessage(
  message: ChatMessageWithThreadMetadata,
  resolvedAttachments: Record<string, ResolvedAttachment>,
) {
  const text = getMessageText(message);
  const textImageUrls = new Set<string>();
  for (const match of text.matchAll(MARKDOWN_IMAGE_RE)) {
    if (match[1]) {
      textImageUrls.add(match[1]);
    }
  }

  const attachmentImages = getMessageAttachments(
    message,
    resolvedAttachments,
  ).flatMap((attachment) =>
    attachment.url &&
    !attachment.expired &&
    attachment.mimeType.startsWith("image/")
      ? [
          {
            alt: attachmentDisplayName(attachment),
            url: attachment.url,
          },
        ]
      : [],
  );

  const generatedImages = getGeneratedImages(message).flatMap((image) =>
    image.url && !textImageUrls.has(image.url)
      ? [
          {
            alt: image.prompt,
            url: image.url,
          },
        ]
      : [],
  );

  return [...attachmentImages, ...generatedImages];
}

export function getAttachmentLinks(
  message: ChatMessageWithThreadMetadata,
  resolvedAttachments: Record<string, ResolvedAttachment>,
) {
  return getMessageAttachments(message, resolvedAttachments).flatMap(
    (attachment) =>
      attachment.url &&
      !attachment.expired &&
      !attachment.mimeType.startsWith("image/")
        ? [
            {
              label: attachmentDisplayName(attachment),
              url: attachment.url,
            },
          ]
        : [],
  );
}
