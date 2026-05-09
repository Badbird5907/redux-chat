import type {
  FileRouter,
  SiloRouteConfigInput,
} from "@silo-storage/sdk-server";
import { createSiloUpload } from "@silo-storage/sdk-server";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";
import { getModelAttachmentExpects } from "@redux/types";

import { fetchAuthQuery, getRequestUserIdFromHeaders } from "@/lib/auth/server";
import {
  buildAttachmentUrl,
  createUploadedAttachmentRecord,
} from "@/lib/silo/core.server";
import { embedAndIndexProjectFile } from "@/server/rag/index-attachment";
import { FREE_PLAN_MAX_ATTACHMENTS, FREE_PLAN_MAX_FILE_SIZE_MB } from "@/upload";

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

const projectAttachmentInput = z.object({
  chatProjectId: z.string(),
});

async function requireOwnedThread(threadId: string | undefined) {
  if (!threadId) {
    return;
  }

  const thread = await fetchAuthQuery(api.functions.threads.getThread, {
    threadId,
  });
  if (!thread) {
    throw new Error("Thread not found");
  }
}

async function requireOwnedProject(projectId: string) {
  const project = await fetchAuthQuery(api.functions.projects.getProject, {
    projectId,
  });
  if (!project) {
    throw new Error("Project not found");
  }
}

// Generic accepted types for project files. Project files are part of a
// long-lived knowledge base, not bound to a specific model's capabilities.
const PROJECT_ATTACHMENT_EXPECTS: SiloRouteConfigInput = [
  {
    mimeTypes: ["image", "pdf", "text"],
    maxFileCount: 50,
  },
] as SiloRouteConfigInput;

export const fileRouter = {
  chatAttachment: f(chatAttachmentInput)
    .middleware(async ({ req, context, input }) => {
      const userId =
        context.userId ?? (await getRequestUserIdFromHeaders(req.headers));
      if (!userId) {
        throw new Error("Unauthorized");
      }
      await requireOwnedThread(input.threadId);

      const billingState = await fetchAuthQuery(
        api.functions.billing.getCurrentBillingState,
        {},
      );
      const tier = billingState.tier;

      return {
        userId,
        threadId: input.threadId,
        modelId: input.modelId,
        expiresAt: Date.now() + DRAFT_ATTACHMENT_TTL_MS,
        tier,
      };
    })
    .expects(({ modelId, tier }) => {
      const baseExpects = getModelAttachmentExpects(modelId);
      if (tier === "free" && baseExpects.length > 0) {
        return baseExpects.map((bucket) => ({
          ...bucket,
          maxFileCount: FREE_PLAN_MAX_ATTACHMENTS,
          maxFileSize: `${FREE_PLAN_MAX_FILE_SIZE_MB}MB`,
        })) as SiloRouteConfigInput;
      }
      return baseExpects as SiloRouteConfigInput;
    })
    .public(true)
    .serveImage(true)
    .expires("7 days")
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
        isPublic: true,
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
          isPublic: true,
          serveImage,
        }),
      };
    }),
  projectAttachment: f(projectAttachmentInput)
    .middleware(async ({ req, context, input }) => {
      const userId =
        context.userId ?? (await getRequestUserIdFromHeaders(req.headers));
      if (!userId) {
        throw new Error("Unauthorized");
      }
      await requireOwnedProject(input.chatProjectId);

      return {
        userId,
        chatProjectId: input.chatProjectId,
      };
    })
    .expects(() => PROJECT_ATTACHMENT_EXPECTS)
    .public(true)
    .onUploadComplete(async ({ metadata, file }) => {
      console.log("onUploadComplete", metadata, file);
      const serveImage = file.mimeType.startsWith("image/");

      await createUploadedAttachmentRecord({
        attachmentId: file.fileKeyId,
        userId: metadata.userId,
        chatProjectId: metadata.chatProjectId,
        projectId: file.projectId,
        environmentId: file.environmentId,
        accessKey: file.accessKey,
        fileKeyId: file.fileKeyId,
        fileId: file.fileId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        isPublic: true,
        serveImage,
        expiresAt: undefined,
      });

      // Fire-and-forget RAG indexing - the upload UI returns immediately and
      // the file's `embeddingStatus` flips from "indexing" to "indexed" as
      // the live query updates.
      void embedAndIndexProjectFile({
        attachmentId: file.fileKeyId,
        userId: metadata.userId,
        chatProjectId: metadata.chatProjectId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        accessKey: file.accessKey,
        isPublic: true,
        serveImage,
      }).catch((error: unknown) => {
        console.error("Project file indexing failed", error);
      });

      return {
        attachmentId: file.fileKeyId,
        fileKeyId: file.fileKeyId,
        accessKey: file.accessKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        size: file.size,
        chatProjectId: metadata.chatProjectId,
        url: await buildAttachmentUrl({
          accessKey: file.accessKey,
          fileName: file.fileName,
          mimeType: file.mimeType,
          isPublic: true,
          serveImage,
        }),
      };
    }),
} satisfies FileRouter<Request, UploadContext>;

export type AppFileRouter = typeof fileRouter;
