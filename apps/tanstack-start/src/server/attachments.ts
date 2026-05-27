import { createServerFn } from "@tanstack/react-start";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { buildAttachmentUrl, getSiloCore } from "@/lib/silo/core.server";
import {
  deleteAttachmentDerivativeCache,
  getReadyPdfDerivativeRecords,
} from "@/server/attachments-core/cache";
import { resolveServingAttachment } from "@/server/attachments-core/resolve-serving-attachment";

type AttachmentForDeletion =
  (typeof api.functions.attachments.listByIds)["_returnType"][number];

async function deleteStoredDerivativeFiles(attachment: AttachmentForDeletion) {
  const pdfDerivatives = await getReadyPdfDerivativeRecords(attachment);
  const siloCore = getSiloCore();

  await Promise.all(
    pdfDerivatives.map((derivative) =>
      siloCore.deleteFile({
        projectId: derivative.projectId,
        environmentId: derivative.environmentId,
        fileKeyId: derivative.fileKeyId,
        accessKey: derivative.accessKey,
      }),
    ),
  );

  await deleteAttachmentDerivativeCache(attachment);
}

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

    const attachments = await fetchAuthQuery(
      api.functions.attachments.listByIds,
      {
        attachmentIds: data.attachmentIds,
      },
    );

    const servingAttachments = await Promise.all(
      attachments.map((attachment) => resolveServingAttachment(attachment)),
    );

    return Promise.all(
      servingAttachments.map(async (attachment) => {
        const url = attachment.expired
          ? undefined
          : await buildAttachmentUrl({
              accessKey: attachment.accessKey,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              isPublic: attachment.isPublic,
              serveImage: attachment.serveImage,
            });

        return {
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
          originalFileName: attachment.originalFileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          expiresAt: attachment.expiresAt,
          expired: attachment.expired,
          status: attachment.status,
          threadId: attachment.threadId,
          messageId: attachment.messageId,
          url,
        };
      }),
    );
  });

export const deleteDraftAttachment = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      attachmentId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const [attachment] = await fetchAuthQuery(
      api.functions.attachments.listByIds,
      {
        attachmentIds: [data.attachmentId],
      },
    );

    if (!attachment) {
      throw new Error("Attachment not found");
    }

    await deleteStoredDerivativeFiles(attachment);

    if (!attachment.expired) {
      const siloCore = getSiloCore();
      await siloCore.deleteFile({
        projectId: attachment.projectId,
        environmentId: attachment.environmentId,
        fileKeyId: attachment.fileKeyId,
        accessKey: attachment.accessKey,
      });
    }

    await fetchAuthMutation(api.functions.attachments.deleteDraftAttachment, {
      attachmentId: data.attachmentId,
    });

    return { success: true };
  });

export const deleteSettingsAttachments = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      attachmentIds: z.array(z.string()).min(1).max(100),
    }),
  )
  .handler(async ({ data }) => {
    const attachmentIds = [...new Set(data.attachmentIds)];
    const attachments = await fetchAuthQuery(
      api.functions.attachments.listByIds,
      {
        attachmentIds,
      },
    );

    if (attachments.length !== attachmentIds.length) {
      throw new Error("One or more attachments could not be found");
    }

    const expiredAttachment = attachments.find(
      (attachment) => attachment.expired,
    );
    if (expiredAttachment) {
      throw new Error("Expired attachments cannot be deleted");
    }

    const result = await fetchAuthMutation(
      api.functions.attachments.deleteUnexpiredAttachments,
      {
        attachmentIds,
      },
    );

    await Promise.all(attachments.map(deleteStoredDerivativeFiles));

    return result;
  });

export const resolvePublicShareAttachments = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      shareId: z.string(),
      attachmentIds: z.array(z.string()).max(100),
    }),
  )
  .handler(async ({ data }) => {
    if (data.attachmentIds.length === 0) {
      return [];
    }

    const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
    const attachments = await client.query(
      api.functions.threadShares.listPublicShareAttachments,
      {
        shareId: data.shareId,
        attachmentIds: data.attachmentIds,
      },
    );

    const servingAttachments = await Promise.all(
      attachments.map((attachment) => resolveServingAttachment(attachment)),
    );

    return Promise.all(
      servingAttachments.map(async (attachment) => {
        const url = attachment.expired
          ? undefined
          : await buildAttachmentUrl({
              accessKey: attachment.accessKey,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              isPublic: attachment.isPublic,
              serveImage: attachment.serveImage,
            });

        return {
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
          originalFileName: attachment.originalFileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          expiresAt: attachment.expiresAt,
          expired: attachment.expired,
          status: attachment.status,
          threadId: attachment.threadId,
          messageId: attachment.messageId,
          url,
        };
      }),
    );
  });
