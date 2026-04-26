import type { FileRouter, SiloRouteConfigInput } from "@silo-storage/sdk-server";
import { createSiloUpload } from "@silo-storage/sdk-server";
import { z } from "zod";

import { getModelAttachmentExpects } from "@redux/types";

import { getRequestUserIdFromHeaders } from "@/lib/auth/server";
import {
  buildAttachmentUrl,
  createUploadedAttachmentRecord,
} from "@/lib/silo/core.server";

export interface UploadContext {
  userId?: string;
}

const f = createSiloUpload<Request, UploadContext>();
const DRAFT_ATTACHMENT_TTL_HOURS = 24;
const DRAFT_ATTACHMENT_TTL_MS = DRAFT_ATTACHMENT_TTL_HOURS * 60 * 60 * 1000;

const chatAttachmentInput = z.object({
  modelId: z.string(),
  threadId: z.string().optional(),
});

export const fileRouter = {
  chatAttachment: f(chatAttachmentInput)
    .middleware(async ({ req, context, input }) => {
      const userId =
        context.userId ?? (await getRequestUserIdFromHeaders(req.headers));
      if (!userId) {
        throw new Error("Unauthorized");
      }

      return {
        userId,
        threadId: input.threadId,
        modelId: input.modelId,
        expiresAt: Date.now() + DRAFT_ATTACHMENT_TTL_MS,
      };
    })
    .expects(({ input }) => {
      const parsedInput = chatAttachmentInput.parse(input);
      return getModelAttachmentExpects(parsedInput.modelId) as SiloRouteConfigInput;
    })
    .public(false)
    .serveImage(true)
    // .public(true)
    .expires("24 hours")
    .onUploadComplete(async ({ metadata, file }) => {
      const serveImage = file.mimeType.startsWith("image/");

      await createUploadedAttachmentRecord({
        attachmentId: file.fileKeyId,
        userId: metadata.userId,
        threadId: metadata.threadId,
        projectId: file.projectId,
        environmentId: file.environmentId,
        accessKey: file.accessKey,
        fileKeyId: file.fileKeyId,
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        isPublic: false,
        serveImage,
        expiresAt: metadata.expiresAt
          ? new Date(metadata.expiresAt).getTime()
          : undefined,
      });

      return {
        attachmentId: file.fileKeyId,
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        threadId: metadata.threadId,
        expiresAt: metadata.expiresAt,
        url: await buildAttachmentUrl({
          accessKey: file.accessKey,
          fileName: file.fileName,
          mimeType: file.mimeType,
          isPublic: false,
          serveImage,
        }),
      };
    }),
} satisfies FileRouter<Request, UploadContext>;

export type AppFileRouter = typeof fileRouter;
