import type { GeneratedFile } from "ai";

import type { ModelRouteInfo } from "@redux/shared/models";

import {
  buildAttachmentDownloadUrl,
  buildAttachmentUrl,
} from "@/lib/silo/core.server";
import {
  persistModelGeneratedFile,
  uploadToSilo,
} from "@/server/ai/model-generated-files";

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
  status?: "generating" | "generated";
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

  await persistModelGeneratedFile({
    userId: input.userId,
    threadId: input.threadId,
    messageId: input.messageId,
    modelGeneratedFileId: generatedImageId,
    kind: "image",
    source: "image_generation",
    modelId: input.modelId,
    provider: input.route.provider,
    toolCallId: input.toolCallId,
    prompt: input.prompt,
    mimeType,
    size: bytes.byteLength,
    storage,
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
    status: "generated",
    storage,
  };
}
