import type { UIDataTypes, UIMessagePart, UITools } from "ai";

import type { ModelRouteInfo } from "@redux/shared/models";

import type { AttachmentSourceRef } from "../attachments-core/types";
import { storeReadyPdfDerivativeText } from "../attachments-core/cache";
import { ensureAttachmentDerivative } from "../attachments-core/ensure-derivative";
import { extractPdfTextDerivative } from "../attachments-core/extract-text";
import { formatBashUploadSummary } from "./bash-uploads";
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
  options: {
    useBashUploadReferences?: boolean;
  } = {},
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

      if (options.useBashUploadReferences) {
        const extraParts: UIMessagePart<UIDataTypes, UITools>[] = [];

        // Always include the bash upload summary so tools can reference files
        const uploadSummary = formatBashUploadSummary(attachments);
        if (uploadSummary) {
          extraParts.push({ type: "text", text: uploadSummary });
        }

        // Also send natively-supported images and PDFs as multimodal parts
        // so the model can "see" them without needing to invoke a tool
        for (const attachment of attachments) {
          const plan = planChatAttachment(route, attachment);
          if (
            plan.deliveryMode === "native" &&
            (plan.kind === "image" || (plan.kind === "pdf" && supportsPdfFiles))
          ) {
            extraParts.push({
              type: "file",
              mediaType: attachment.mimeType,
              url: attachment.url,
              filename: attachment.fileName,
            } satisfies UIMessagePart<UIDataTypes, UITools>);
          }
        }

        return extraParts.length > 0
          ? { ...message, parts: [...message.parts, ...extraParts] }
          : message;
      }

      const materializedParts = (
        await Promise.all(
          attachments.map(async (attachment) => {
            const plan = planChatAttachment(route, attachment);
            if (
              plan.deliveryMode === "native" &&
              !(plan.kind === "pdf" && !supportsPdfFiles)
            ) {
              return [
                {
                  type: "file",
                  mediaType: attachment.mimeType,
                  url: attachment.url,
                  filename: attachment.fileName,
                } satisfies UIMessagePart<UIDataTypes, UITools>,
              ];
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

              return [
                toInlineTextPart({
                  fileName: attachment.fileName,
                  mimeType: attachment.mimeType,
                  textChunks: derivative.textChunks,
                }),
              ];
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
                  return [
                    toInlineTextPart({
                      fileName: derivative.fileName,
                      mimeType: derivative.mimeType,
                      textChunks: derivative.textChunks,
                    }),
                  ];
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

                return [
                  toInlineTextPart({
                    fileName: derivative.fileName,
                    mimeType: derivative.mimeType,
                    textChunks: pdfText.textChunks,
                  }),
                ];
              }

              return [
                {
                  type: "file",
                  mediaType: "application/pdf",
                  url: derivative.url,
                  filename: derivative.fileName,
                } satisfies UIMessagePart<UIDataTypes, UITools>,
              ];
            }

            return [
              toInlineTextPart({
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                textChunks: derivative.textChunks,
              }),
            ];
          }),
        )
      ).flat();

      return {
        ...message,
        parts: [...message.parts, ...materializedParts],
      };
    }),
  );
}
