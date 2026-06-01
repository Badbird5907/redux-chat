import type { FunctionReference } from "convex/server";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthMutation } from "@/lib/auth/server";
import {
  buildAttachmentDownloadUrl,
  buildAttachmentUrl,
  getSiloCore,
} from "@/lib/silo/core.server";

export type ModelGeneratedFileSource = "image_generation" | "shell" | "e2b";
export type ModelGeneratedFileKind = "image" | "file";

export interface ModelFileStorage {
  projectId: string;
  environmentId: string;
  fileKeyId: string;
  accessKey: string;
}

/**
 * Inline part emitted by the `present_file` tool. Mirrors the
 * `data-generated-image` part but is generic over arbitrary sandbox files:
 * images render inline (caption = file name), other files render as a download
 * card.
 */
export interface ModelFilePart {
  type: "data-model-file";
  kind: ModelGeneratedFileKind;
  url: string;
  downloadUrl: string;
  mimeType: string;
  fileName: string;
  size: number;
  source: ModelGeneratedFileSource;
  createdAt: number;
  storage: ModelFileStorage;
}

export function isImageMimeType(mimeType: string | undefined): boolean {
  return typeof mimeType === "string" && mimeType.startsWith("image/");
}

export async function uploadToSilo(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  metadata: Record<string, unknown>;
}): Promise<ModelFileStorage> {
  const siloCore = getSiloCore();
  const prepared = await siloCore.prepareUpload({
    file: {
      fileName: input.fileName,
      size: input.bytes.byteLength,
      mimeType: input.mimeType,
      isPublic: true,
      serveImage: isImageMimeType(input.mimeType),
      metadata: input.metadata,
    },
    uploadStrategy: "server",
    uploadMethod: "put",
  });

  const uploadResponse = await fetch(prepared.file.uploadUrl, {
    method:
      prepared.file.uploadMethod === "put" ? "PUT" : prepared.file.uploadMethod,
    headers: {
      "Content-Type": input.mimeType,
    },
    body: input.bytes.buffer.slice(
      input.bytes.byteOffset,
      input.bytes.byteOffset + input.bytes.byteLength,
    ) as ArrayBuffer,
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text().catch(() => "");
    throw new Error(
      `Silo upload failed: ${uploadResponse.status}${
        errorText ? ` ${errorText.slice(0, 300)}` : ""
      }`,
    );
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

const modelGeneratedFilesApi = api.functions as typeof api.functions & {
  modelGeneratedFiles: {
    internal_create: FunctionReference<"mutation">;
  };
};

export async function persistModelGeneratedFile(input: {
  userId: string;
  threadId: string;
  messageId: string;
  modelGeneratedFileId: string;
  kind: ModelGeneratedFileKind;
  source: ModelGeneratedFileSource;
  modelId?: string;
  provider?: string;
  toolCallId?: string;
  prompt?: string;
  mimeType: string;
  size: number;
  image?: { width?: number; height?: number };
  storage: ModelFileStorage;
  fileName: string;
}): Promise<void> {
  await fetchAuthMutation(
    modelGeneratedFilesApi.modelGeneratedFiles.internal_create,
    {
      secret: env.INTERNAL_CONVEX_SECRET,
      userId: input.userId,
      modelGeneratedFileId: input.modelGeneratedFileId,
      threadId: input.threadId,
      messageId: input.messageId,
      kind: input.kind,
      source: input.source,
      modelId: input.modelId,
      provider: input.provider,
      toolCallId: input.toolCallId,
      prompt: input.prompt,
      mimeType: input.mimeType,
      size: input.size,
      image: input.image,
      projectId: input.storage.projectId,
      environmentId: input.storage.environmentId,
      accessKey: input.storage.accessKey,
      fileKeyId: input.storage.fileKeyId,
      fileName: input.fileName,
    },
  );
}

interface StoreModelPresentedFileInput {
  userId: string;
  threadId: string;
  messageId: string;
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  source: Extract<ModelGeneratedFileSource, "shell" | "e2b">;
  modelId?: string;
  provider?: string;
  toolCallId?: string;
}

/**
 * Uploads a file a model presented from a sandbox to Silo, records it in
 * `modelGeneratedFiles`, and returns the inline `data-model-file` part that the
 * chat UI renders.
 */
export async function storeModelPresentedFile(
  input: StoreModelPresentedFileInput,
): Promise<ModelFilePart> {
  const kind: ModelGeneratedFileKind = isImageMimeType(input.mimeType)
    ? "image"
    : "file";
  const modelGeneratedFileId = crypto.randomUUID();
  const storage = await uploadToSilo({
    bytes: input.bytes,
    fileName: input.fileName,
    mimeType: input.mimeType,
    metadata: {
      userId: input.userId,
      threadId: input.threadId,
      messageId: input.messageId,
      modelId: input.modelId,
      source: input.source,
      toolCallId: input.toolCallId,
      mimeType: input.mimeType,
    },
  });

  await persistModelGeneratedFile({
    userId: input.userId,
    threadId: input.threadId,
    messageId: input.messageId,
    modelGeneratedFileId,
    kind,
    source: input.source,
    modelId: input.modelId,
    provider: input.provider,
    toolCallId: input.toolCallId,
    mimeType: input.mimeType,
    size: input.bytes.byteLength,
    storage,
    fileName: input.fileName,
  });

  const [url, downloadUrl] = await Promise.all([
    buildAttachmentUrl({
      accessKey: storage.accessKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      isPublic: true,
      serveImage: kind === "image",
    }),
    buildAttachmentDownloadUrl({
      accessKey: storage.accessKey,
      fileKeyId: storage.fileKeyId,
      fileName: input.fileName,
      isPublic: true,
    }),
  ]);

  return {
    type: "data-model-file",
    kind,
    url,
    downloadUrl,
    mimeType: input.mimeType,
    fileName: input.fileName,
    size: input.bytes.byteLength,
    source: input.source,
    createdAt: Date.now(),
    storage,
  };
}
