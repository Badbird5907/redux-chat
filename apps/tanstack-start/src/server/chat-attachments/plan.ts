import { classifyChatAttachment, resolveModelAttachmentDelivery } from "@redux/shared/models";
import type { ChatAttachmentDeliveryMode, ChatAttachmentKind, ModelRouteInfo } from "@redux/shared/models";

import type { AttachmentDerivativeKind, AttachmentSourceRef } from "../attachments-core/types";

export interface PlannedChatAttachment {
  kind: ChatAttachmentKind;
  deliveryMode: ChatAttachmentDeliveryMode;
  derivativeKind?: AttachmentDerivativeKind;
}

export function planChatAttachment(
  route: ModelRouteInfo,
  attachment: Pick<AttachmentSourceRef, "fileName" | "mimeType">,
): PlannedChatAttachment {
  const kind = classifyChatAttachment({
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
  });
  if (!kind) {
    throw new Error(`Unsupported chat attachment: ${attachment.fileName}`);
  }

  const deliveryMode = resolveModelAttachmentDelivery(route.id, {
    name: attachment.fileName,
    type: attachment.mimeType,
  });
  if (!deliveryMode) {
    throw new Error(
      `No delivery strategy is configured for ${attachment.fileName} on ${route.id}`,
    );
  }

  if (deliveryMode === "native") {
    return { kind, deliveryMode };
  }

  if (deliveryMode === "convert_to_pdf") {
    return {
      kind,
      deliveryMode,
      derivativeKind: "converted_pdf",
    };
  }

  return {
    kind,
    deliveryMode,
    derivativeKind: kind === "spreadsheet" ? "spreadsheet_text" : "normalized_text",
  };
}
