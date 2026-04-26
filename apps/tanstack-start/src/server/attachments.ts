import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { buildAttachmentUrl, getSiloCore } from "@/lib/silo/core.server";

export const resolveAttachments = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      attachmentIds: z.array(z.string()).max(100),
    }),
  )
  .handler(async ({ data }) => {
    if (data.attachmentIds.length === 0) {
      return [];
    }

    const attachments = await fetchAuthQuery(api.functions.attachments.listByIds, {
      attachmentIds: data.attachmentIds,
    });

    return Promise.all(
      attachments.map(async (attachment) => ({
        attachmentId: attachment.attachmentId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        expiresAt: attachment.expiresAt,
        status: attachment.status,
        threadId: attachment.threadId,
        messageId: attachment.messageId,
        url: await buildAttachmentUrl({
          accessKey: attachment.accessKey,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          isPublic: attachment.isPublic,
          serveImage: attachment.serveImage,
        }),
      })),
    );
  });

export const deleteDraftAttachment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      attachmentId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const [attachment] = await fetchAuthQuery(api.functions.attachments.listByIds, {
      attachmentIds: [data.attachmentId],
    });

    if (!attachment) {
      throw new Error("Attachment not found");
    }

    const siloCore = getSiloCore();
    await siloCore.deleteFile({
      projectId: attachment.projectId,
      environmentId: attachment.environmentId,
      fileKeyId: attachment.fileKeyId,
      accessKey: attachment.accessKey,
    });

    await fetchAuthMutation(api.functions.attachments.deleteDraftAttachment, {
      attachmentId: data.attachmentId,
    });

    return { success: true };
  });
