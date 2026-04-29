import type { UIDataTypes, UIMessagePart, UITools } from "ai";

import type { ModelRouteInfo } from "@redux/shared/models";

import { ensureAttachmentDerivative } from "../attachments-core/ensure-derivative";
import type { AttachmentSourceRef } from "../attachments-core/types";
import { planChatAttachment } from "./plan";

export interface ChatAttachmentRecord extends AttachmentSourceRef {
  url: string;
}

export interface ChatRequestMessageLike {
  id: string;
  role: "user" | "assistant";
  parts: UIMessagePart<UIDataTypes, UITools>[];
}

function formatInlineAttachmentText(input: {
  fileName: string;
  mimeType: string;
  textChunks: string[];
}) {
  return [
    "[Attached file]",
    `Name: ${input.fileName}`,
    `Type: ${input.mimeType}`,
    "Delivery: normalized plain text for model compatibility",
    "",
    "----- BEGIN FILE CONTENT -----",
    input.textChunks.join("\n\n"),
    "----- END FILE CONTENT -----",
  ].join("\n");
}

export async function materializeAttachmentsForRoute<TMessage extends ChatRequestMessageLike>(
  route: ModelRouteInfo,
  messages: TMessage[],
  attachmentsByMessageId: Map<string, ChatAttachmentRecord[]>,
) {
  if (attachmentsByMessageId.size === 0) {
    return messages;
  }

  return Promise.all(
    messages.map(async (message) => {
      if (message.role !== "user") {
        return message;
      }

      const attachments = attachmentsByMessageId.get(message.id);
      if (!attachments?.length) {
        return message;
      }

      const materializedParts: UIMessagePart<UIDataTypes, UITools>[] = [];

      for (const attachment of attachments) {
        const plan = planChatAttachment(route, attachment);
        if (plan.deliveryMode === "native") {
          materializedParts.push({
            type: "file",
            mediaType: attachment.mimeType,
            url: attachment.url,
            filename: attachment.fileName,
          });
          continue;
        }

        if (!plan.derivativeKind) {
          throw new Error(
            `Attachment derivative kind is missing for ${attachment.fileName}`,
          );
        }

        const derivative = await ensureAttachmentDerivative({
          source: attachment,
          kind: plan.derivativeKind,
        });

        if (derivative.kind === "converted_pdf") {
          materializedParts.push({
            type: "file",
            mediaType: "application/pdf",
            url: derivative.url,
            filename: derivative.fileName,
          });
          continue;
        }

        materializedParts.push({
          type: "text",
          text: formatInlineAttachmentText({
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            textChunks: derivative.textChunks,
          }),
        });
      }

      return {
        ...message,
        parts: [...message.parts, ...materializedParts],
      };
    }),
  );
}
