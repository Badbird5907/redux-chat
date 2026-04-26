import type { FileRouter } from "@silo-storage/sdk-server";
import { createSiloUpload } from "@silo-storage/sdk-server";
import { z } from "zod";

import { getAllowedMimeTypesForModel } from "@redux/types";

import { getRequestUserIdFromHeaders } from "@/lib/auth/server";
import { buildAttachmentUrl, createUploadedAttachmentRecord } from "@/lib/silo/core.server";

export interface UploadContext {
  userId?: string;
}

const f = createSiloUpload<Request, UploadContext>();
const ATTACHMENT_TTL_DAYS = 60;
const ATTACHMENT_TTL_MS = ATTACHMENT_TTL_DAYS * 24 * 60 * 60 * 1000;

const chatAttachmentInput = z.object({
  modelId: z.string(),
  threadId: z.string().optional(),
});

function resolveChatAttachmentMimeTypes(modelId: string): string[] {
  return [...getAllowedMimeTypesForModel(modelId)];
}

export const fileRouter = {
  chatAttachment: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 4,
    },
    video: {
      maxFileSize: "64MB",
      maxFileCount: 4,
    },
    audio: {
      maxFileSize: "32MB",
      maxFileCount: 4,
    },
    "application/pdf": {
      maxFileSize: "16MB",
      maxFileCount: 4,
    },
    "text/plain": {
      maxFileSize: "4MB",
      maxFileCount: 4,
    },
    "application/msword": {
      maxFileSize: "8MB",
      maxFileCount: 4,
    },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      maxFileSize: "8MB",
      maxFileCount: 4,
    },
  })
    .input(chatAttachmentInput)
    .public(false)
    .serveImage(true)
    .expires("60 days")
    .mimeTypes(({ input }) => {
      const parsedInput = chatAttachmentInput.parse(input);
      return resolveChatAttachmentMimeTypes(parsedInput.modelId);
    })
    .middleware(async ({ req, context, input }) => {
      const userId = context.userId ?? (await getRequestUserIdFromHeaders(req.headers));
      if (!userId) {
        throw new Error("Unauthorized");
      }

      return {
        userId,
        modelId: input.modelId,
        threadId: input.threadId,
        expiresAt: Date.now() + ATTACHMENT_TTL_MS,
      };
    })
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
        expiresAt: metadata.expiresAt,
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
