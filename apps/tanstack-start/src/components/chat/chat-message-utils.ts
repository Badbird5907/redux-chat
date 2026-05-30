import type { UIMessage } from "ai";

import {
  classifyChatAttachment,
  resolveModelAttachmentDelivery,
  resolveModelRoute,
} from "@redux/shared/models";

import type {
  ChatMessageWithThreadMetadata,
  MessageAttachmentSummary,
  PersistedChatMessage,
} from "./chat-types";

export function toChatUIMessage(
  message: PersistedChatMessage,
): ChatMessageWithThreadMetadata {
  const metadata =
    "attachments" in message && Array.isArray(message.attachments)
      ? {
          attachments: message.attachments,
        }
      : undefined;

  return {
    id: message.id,
    role: message.role,
    parts: message.parts as UIMessage["parts"],
    attachments:
      "attachments" in message && Array.isArray(message.attachments)
        ? message.attachments
        : undefined,
    canceledAt: "canceledAt" in message ? message.canceledAt : undefined,
    createdAt:
      "_creationTime" in message && typeof message._creationTime === "number"
        ? message._creationTime
        : undefined,
    depth: "depth" in message ? message.depth : undefined,
    metadata,
    error: "error" in message ? message.error : undefined,
    model: "model" in message ? message.model : undefined,
    thinkingLevel:
      "thinkingLevel" in message ? message.thinkingLevel : undefined,
    mutation: "mutation" in message ? message.mutation : undefined,
    parentId: "parentId" in message ? message.parentId : undefined,
    siblingIndex: "siblingIndex" in message ? message.siblingIndex : undefined,
    status: "status" in message ? message.status : undefined,
  };
}

export function haveEquivalentMessageStructure(
  left: UIMessage[],
  right: UIMessage[],
) {
  return (
    left.length === right.length &&
    left.every((message, index) => {
      const other = right[index];

      if (!other) {
        return false;
      }

      if (message.id !== other.id || message.role !== other.role) {
        return false;
      }

      return (
        getRenderableMessageSignature(message) ===
        getRenderableMessageSignature(other)
      );
    })
  );
}

function getRenderableMessageSignature(message: UIMessage) {
  const renderFields = message as UIMessage & {
    attachments?: unknown;
    canceledAt?: unknown;
    depth?: unknown;
    error?: unknown;
    metadata?: unknown;
    model?: unknown;
    mutation?: unknown;
    parentId?: unknown;
    siblingIndex?: unknown;
    status?: unknown;
    thinkingLevel?: unknown;
  };

  return JSON.stringify({
    parts: message.parts,
    attachments: renderFields.attachments,
    canceledAt: renderFields.canceledAt,
    depth: renderFields.depth,
    error: renderFields.error,
    metadata: renderFields.metadata,
    model: renderFields.model,
    mutation: renderFields.mutation,
    parentId: renderFields.parentId,
    siblingIndex: renderFields.siblingIndex,
    status: renderFields.status,
    thinkingLevel: renderFields.thinkingLevel,
  });
}

export function isAttachmentExpired(
  expiresAt: number | undefined,
  now = Date.now(),
) {
  return expiresAt !== undefined && expiresAt <= now;
}

export function attachmentDisplayName(a: {
  fileName: string;
  originalFileName?: string;
}) {
  return a.originalFileName ?? a.fileName;
}

export function didUseDerivative(attachment: {
  originalFileName?: string;
  usedDerivative?: boolean;
}) {
  return attachment.usedDerivative ?? attachment.originalFileName !== undefined;
}

export function isGeneratingDerivative(attachment: {
  convertingToPdf?: boolean;
  generatingDerivative?: boolean;
  originalFileName?: string;
  usedDerivative?: boolean;
}) {
  return (
    (attachment.generatingDerivative ?? attachment.convertingToPdf) === true &&
    !didUseDerivative(attachment)
  );
}

export function modelUsesDerivativeForAttachment(
  modelId: string | undefined,
  attachment: Pick<MessageAttachmentSummary, "fileName" | "mimeType">,
) {
  if (!modelId) {
    return false;
  }

  const route = resolveModelRoute(modelId);
  if (!route) {
    return false;
  }

  const deliveryMode = resolveModelAttachmentDelivery(route.id, {
    name: attachment.fileName,
    type: attachment.mimeType,
  });
  if (!deliveryMode) {
    return false;
  }

  if (deliveryMode !== "native") {
    return true;
  }

  return (
    classifyChatAttachment(attachment) === "pdf" &&
    !route.modalities.input.includes("pdf")
  );
}
