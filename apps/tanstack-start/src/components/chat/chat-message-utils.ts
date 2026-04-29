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
    metadata,
    error: "error" in message ? message.error : undefined,
    model: "model" in message ? message.model : undefined,
    parentId: "parentId" in message ? message.parentId : undefined,
    status: "status" in message ? message.status : undefined,
  };
}

export function projectVisibleMessages(messages: PersistedChatMessage[]) {
  const orderedMessages = [...messages].sort((left, right) => {
    const createdAtDelta = left._creationTime - right._creationTime;
    if (createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return left.id.localeCompare(right.id);
  });

  const latestAssistantByParentId = new Map<string, PersistedChatMessage>();

  for (const message of orderedMessages) {
    if (message.role !== "assistant" || typeof message.parentId !== "string") {
      continue;
    }

    const existing = latestAssistantByParentId.get(message.parentId);
    if (
      !existing ||
      message.siblingIndex > existing.siblingIndex ||
      (message.siblingIndex === existing.siblingIndex &&
        message._creationTime > existing._creationTime)
    ) {
      latestAssistantByParentId.set(message.parentId, message);
    }
  }

  const visibleMessages: PersistedChatMessage[] = [];
  const appendedAssistantIds = new Set<string>();

  for (const message of orderedMessages) {
    if (message.role === "assistant" && typeof message.parentId === "string") {
      continue;
    }

    visibleMessages.push(message);

    if (message.role !== "user") {
      continue;
    }

    const latestAssistant = latestAssistantByParentId.get(message.id);
    if (!latestAssistant) {
      continue;
    }

    visibleMessages.push(latestAssistant);
    appendedAssistantIds.add(latestAssistant.id);
  }

  for (const message of orderedMessages) {
    if (
      message.role !== "assistant" ||
      typeof message.parentId !== "string" ||
      appendedAssistantIds.has(message.id)
    ) {
      continue;
    }

    if (latestAssistantByParentId.get(message.parentId)?.id !== message.id) {
      continue;
    }

    visibleMessages.push(message);
  }

  return visibleMessages;
}

export function haveEquivalentMessageStructure(
  left: UIMessage[],
  right: UIMessage[],
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const other = right[index];

    if (!other) {
      return false;
    }

    if (message.id !== other.id || message.role !== other.role) {
      return false;
    }

    if (message.parts.length !== other.parts.length) {
      return false;
    }

    return message.parts.every((part, partIndex) => {
      const otherPart = other.parts[partIndex];

      if (part.type !== otherPart?.type) {
        return false;
      }

      if ("text" in part || "text" in otherPart) {
        return (
          "text" in part && "text" in otherPart && part.text === otherPart.text
        );
      }

      return true;
    });
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
