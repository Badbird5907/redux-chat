import type { GeneratedFile } from "ai";
import type { FunctionReference } from "convex/server";

import type { ModelRouteInfo } from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthMutation } from "@/lib/auth/server";
import {
  buildAttachmentDownloadUrl,
  buildAttachmentUrl,
  getSiloCore,
} from "@/lib/silo/core.server";

export interface GeneratedImagePart {
  type: "data-generated-image";
  url: string;
  downloadUrl: string;
  mimeType: string;
  width?: number;
  height?: number;
  prompt: string;
  modelId: string;
  provider: string;
  createdAt: number;
  storage: {
    projectId: string;
    environmentId: string;
    fileKeyId: string;
    accessKey: string;
  };
}

interface StoreGeneratedImageInput {
  userId: string;
  threadId: string;
  messageId: string;
  modelId: string;
  route: ModelRouteInfo;
  prompt: string;
  image: GeneratedFile;
  toolCallId?: string;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

async function uploadToSilo(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  metadata: Record<string, unknown>;
}) {
  const siloCore = getSiloCore();
  const prepared = await siloCore.prepareUpload({
    file: {
      fileName: input.fileName,
      size: input.bytes.byteLength,
      mimeType: input.mimeType,
      isPublic: true,
      serveImage: true,
      metadata: input.metadata,
    },
    uploadStrategy: "server",
  });

  const uploadResponse = await fetch(prepared.file.uploadUrl, {
    method: prepared.file.uploadMethod,
    headers: {
      "Content-Type": input.mimeType,
    },
    body: input.bytes.buffer.slice(
      input.bytes.byteOffset,
      input.bytes.byteOffset + input.bytes.byteLength,
    ) as ArrayBuffer,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Silo upload failed: ${uploadResponse.status}`);
  }

  const files = await siloCore.listFiles({});
  const file = files.files.find(
    (candidate) => candidate.id === prepared.file.fileKeyId,
  );

  if (!file) {
    throw new Error("Uploaded Silo file metadata was not found.");
  }

  return {
    accessKey: prepared.file.accessKey,
    fileKeyId: prepared.file.fileKeyId,
    projectId: file.projectId,
    environmentId: file.environmentId,
  };
}

export async function storeGeneratedImage(
  input: StoreGeneratedImageInput,
): Promise<GeneratedImagePart> {
  const mimeType = input.image.mediaType || "image/png";
  const generatedImageId = crypto.randomUUID();
  const fileName = `generated-${generatedImageId}.${extensionForMimeType(mimeType)}`;
  const bytes = input.image.uint8Array;
  const storage = await uploadToSilo({
    bytes,
    fileName,
    mimeType,
    metadata: {
      userId: input.userId,
      threadId: input.threadId,
      messageId: input.messageId,
      modelId: input.modelId,
      source: "image_generation",
      toolCallId: input.toolCallId,
      prompt: input.prompt,
      mimeType,
    },
  });

  const functionsApi = api.functions as typeof api.functions & {
    generatedImages: {
      internal_create: FunctionReference<"mutation">;
    };
  };

  await fetchAuthMutation(functionsApi.generatedImages.internal_create, {
    secret: env.INTERNAL_CONVEX_SECRET,
    userId: input.userId,
    generatedImageId,
    threadId: input.threadId,
    messageId: input.messageId,
    modelId: input.modelId,
    provider: input.route.provider,
    toolCallId: input.toolCallId,
    prompt: input.prompt,
    mimeType,
    size: bytes.byteLength,
    projectId: storage.projectId,
    environmentId: storage.environmentId,
    accessKey: storage.accessKey,
    fileKeyId: storage.fileKeyId,
    fileName,
  });

  const [url, downloadUrl] = await Promise.all([
    buildAttachmentUrl({
      accessKey: storage.accessKey,
      fileName,
      mimeType,
      isPublic: true,
      serveImage: true,
    }),
    buildAttachmentDownloadUrl({
      accessKey: storage.accessKey,
      fileKeyId: storage.fileKeyId,
      fileName,
      isPublic: true,
    }),
  ]);

  return {
    type: "data-generated-image",
    url,
    downloadUrl,
    mimeType,
    prompt: input.prompt,
    modelId: input.modelId,
    provider: input.route.provider,
    createdAt: Date.now(),
    storage,
  };
}
