import type { UIDataTypes, UIMessagePart, UITools } from "ai";

import type { ModelRouteInfo } from "@redux/shared/models";

import type { AttachmentSourceRef } from "../attachments-core/types";
import { storeReadyPdfDerivativeText } from "../attachments-core/cache";
import { ensureAttachmentDerivative } from "../attachments-core/ensure-derivative";
import { extractPdfTextDerivative } from "../attachments-core/extract-text";
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

function routeSupportsPdfFiles(route: ModelRouteInfo) {
  return route.modalities.input.includes("pdf");
}

async function downloadBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download converted PDF: ${response.status} ${response.statusText}`,
    );
  }

  return response.arrayBuffer();
}

function toInlineTextPart(input: {
  fileName: string;
  mimeType: string;
  textChunks: string[];
}): UIMessagePart<UIDataTypes, UITools> {
  return {
    type: "text",
    text: formatInlineAttachmentText(input),
  };
}

export async function materializeAttachmentsForRoute<
  TMessage extends ChatRequestMessageLike,
>(
  route: ModelRouteInfo,
  messages: TMessage[],
  attachmentsByMessageId: Map<string, ChatAttachmentRecord[]>,
) {
  if (attachmentsByMessageId.size === 0) {
    return messages;
  }

  const supportsPdfFiles = routeSupportsPdfFiles(route);

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
        if (
          plan.deliveryMode === "native" &&
          !(plan.kind === "pdf" && !supportsPdfFiles)
        ) {
          materializedParts.push({
            type: "file",
            mediaType: attachment.mimeType,
            url: attachment.url,
            filename: attachment.fileName,
          });
          continue;
        }

        if (plan.kind === "pdf" && !supportsPdfFiles) {
          const derivative = await ensureAttachmentDerivative({
            source: attachment,
            kind: "pdf_text",
          });
          if (derivative.kind === "converted_pdf") {
            throw new Error(
              `Expected extracted PDF text for ${attachment.fileName}, received a PDF derivative instead`,
            );
          }

          materializedParts.push(
            toInlineTextPart({
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              textChunks: derivative.textChunks,
            }),
          );
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
          if (!supportsPdfFiles) {
            if (derivative.textChunks && derivative.textChunks.length > 0) {
              materializedParts.push(
                toInlineTextPart({
                  fileName: derivative.fileName,
                  mimeType: derivative.mimeType,
                  textChunks: derivative.textChunks,
                }),
              );
              continue;
            }

            const pdfText = await extractPdfTextDerivative({
              source: {
                ...attachment,
                fileName: derivative.fileName,
                mimeType: derivative.mimeType,
              },
              bytes: await downloadBytes(derivative.url),
            });

            await storeReadyPdfDerivativeText(
              {
                source: attachment,
                kind: "converted_pdf",
              },
              {
                charCount: pdfText.charCount,
                textChunks: pdfText.textChunks,
              },
            );

            materializedParts.push(
              toInlineTextPart({
                fileName: derivative.fileName,
                mimeType: derivative.mimeType,
                textChunks: pdfText.textChunks,
              }),
            );
            continue;
          }

          materializedParts.push({
            type: "file",
            mediaType: "application/pdf",
            url: derivative.url,
            filename: derivative.fileName,
          });
          continue;
        }

        materializedParts.push(
          toInlineTextPart({
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            textChunks: derivative.textChunks,
          }),
        );
      }

      return {
        ...message,
        parts: [...message.parts, ...materializedParts],
      };
    }),
  );
}
