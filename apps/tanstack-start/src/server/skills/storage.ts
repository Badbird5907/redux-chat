import { createHash } from "node:crypto";
import type { SkillPackageFile } from "@/server/skills/validation";

import type { SkillChunkEncoding, SkillFileChunkRoute } from "@redux/types";
import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { getSiloCore } from "@/lib/silo/core.server";
import { buildDerivedSkillChunks } from "@/server/skills/chunking";
import { mapWithConcurrency } from "@/server/skills/concurrency";

export interface SkillImportSource {
  sourceType: "upload" | "github" | "model";
  originalFileName?: string;
  githubOriginalUrl?: string;
  githubOwner?: string;
  githubRepository?: string;
  githubRequestedRef?: string;
  githubSelectedPath?: string;
  githubCommitSha?: string;
  proposalId?: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
}

interface StorageLocator {
  projectId: string;
  environmentId: string;
  accessKey: string;
  fileKeyId: string;
}

interface UploadedSkillFile extends StorageLocator {
  skillFileId: string;
  path: string;
  mimeType: string;
  size: number;
  sha256: string;
  isText: boolean;
  lineCount?: number;
  isSymlink?: boolean;
  lfsPointer?: boolean;
  chunkCount: number;
}

interface UploadedSkillChunk extends StorageLocator, SkillFileChunkRoute {
  skillFileId: string;
  encoding: SkillChunkEncoding;
}

interface UploadedChunkManifest {
  skillFileId: string;
  totalLines: number;
  chunks: SkillFileChunkRoute[];
}

interface PendingObject {
  logicalObjectId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  hash: string;
  metadata: Record<string, unknown>;
}

function generateId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function discoverUploadedObjects(
  skillImportId: string,
  expectedIds: Set<string>,
) {
  const siloCore = getSiloCore();
  const delays = [0, 100, 250, 500, 1000];
  let found = new Map<
    string,
    Awaited<ReturnType<typeof siloCore.listFiles>>["files"][number]
  >();
  for (const delay of delays) {
    if (delay > 0) await sleep(delay);
    found = new Map();
    let page = 1;
    while (true) {
      const result = await siloCore.listFiles({
        metadata: { skillImportId },
        page,
        pageSize: 100,
      });
      for (const file of result.files) {
        const logicalObjectId = file.metadata?.logicalObjectId;
        if (typeof logicalObjectId !== "string") continue;
        if (found.has(logicalObjectId)) {
          throw new Error(
            `Duplicate uploaded skill object: ${logicalObjectId}`,
          );
        }
        found.set(logicalObjectId, file);
      }
      if (!result.pagination.hasNextPage) break;
      page += 1;
    }
    if (
      (expectedIds.size === 0 && found.size > 0) ||
      (expectedIds.size === found.size &&
        [...expectedIds].every((id) => found.get(id)?.status === "completed"))
    ) {
      return found;
    }
  }
  const missing = [...expectedIds].filter(
    (id) => found.get(id)?.status !== "completed",
  );
  throw new Error(
    `Uploaded skill metadata was incomplete: ${missing.join(", ")}`,
  );
}

async function deleteDiscoveredObjects(
  objects: Map<
    string,
    { projectId: string; environmentId: string; id: string; accessKey: string }
  >,
) {
  const siloCore = getSiloCore();
  await Promise.allSettled(
    [...objects.values()].map((file) =>
      siloCore.deleteFile({
        projectId: file.projectId,
        environmentId: file.environmentId,
        fileKeyId: file.id,
        accessKey: file.accessKey,
      }),
    ),
  );
}

async function uploadSkillFiles(userId: string, files: SkillPackageFile[]) {
  const skillImportId = generateId();
  const originalDescriptors: {
    file: SkillPackageFile;
    skillFileId: string;
    chunkCount: number;
  }[] = [];
  const chunkDescriptors: {
    skillFileId: string;
    route: SkillFileChunkRoute;
    encoding: SkillChunkEncoding;
    logicalObjectId: string;
  }[] = [];
  const chunkManifests: UploadedChunkManifest[] = [];
  const pendingObjects: PendingObject[] = [];

  for (const file of files) {
    const skillFileId = generateId();
    const originalLogicalId = `original:${skillFileId}`;
    pendingObjects.push({
      logicalObjectId: originalLogicalId,
      fileName: file.path.split("/").at(-1) ?? "skill-file",
      mimeType: file.mimeType,
      bytes: file.bytes,
      hash: file.sha256,
      metadata: {
        userId,
        kind: "skill-original",
        path: file.path,
        skillImportId,
        logicalObjectId: originalLogicalId,
      },
    });

    const derived = file.text
      ? buildDerivedSkillChunks(file.text)
      : file.text === ""
        ? buildDerivedSkillChunks("")
        : undefined;
    originalDescriptors.push({
      file,
      skillFileId,
      chunkCount: derived?.chunks.length ?? 0,
    });
    if (!derived) continue;
    const routes: SkillFileChunkRoute[] = [];
    for (const chunk of derived.chunks) {
      const logicalObjectId = `chunk:${skillFileId}:${chunk.chunkIndex}`;
      const route = {
        chunkIndex: chunk.chunkIndex,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        startByteInLine: chunk.startByteInLine,
        endByteInLine: chunk.endByteInLine,
        uncompressedBytes: chunk.uncompressedBytes,
        storedBytes: chunk.storedBytes,
      };
      routes.push(route);
      chunkDescriptors.push({
        skillFileId,
        route,
        encoding: chunk.encoding,
        logicalObjectId,
      });
      pendingObjects.push({
        logicalObjectId,
        fileName: `${skillFileId}-${chunk.chunkIndex}.chunk`,
        mimeType: "application/octet-stream",
        bytes: chunk.bytes,
        hash: createHash("sha256").update(chunk.bytes).digest("hex"),
        metadata: {
          userId,
          kind: "skill-chunk",
          path: file.path,
          skillImportId,
          logicalObjectId,
          skillFileId,
          chunkIndex: chunk.chunkIndex,
        },
      });
    }
    chunkManifests.push({
      skillFileId,
      totalLines: derived.totalLines,
      chunks: routes,
    });
  }

  const siloCore = getSiloCore();
  let discovered = new Map<
    string,
    Awaited<ReturnType<typeof siloCore.listFiles>>["files"][number]
  >();
  try {
    const prepared = await mapWithConcurrency(
      pendingObjects,
      4,
      async (object) => {
        const upload = await siloCore.prepareUpload({
          file: {
            fileName: object.fileName,
            size: object.bytes.byteLength,
            mimeType: object.mimeType,
            hash: object.hash,
            isPublic: false,
            serveImage: false,
            metadata: object.metadata,
          },
          uploadStrategy: "server",
          uploadMethod: "put",
        });
        return { object, upload };
      },
    );
    await mapWithConcurrency(prepared, 4, async ({ object, upload }) => {
      const body = object.bytes.buffer.slice(
        object.bytes.byteOffset,
        object.bytes.byteOffset + object.bytes.byteLength,
      ) as ArrayBuffer;
      const response = await fetch(upload.file.uploadUrl, {
        method:
          upload.file.uploadMethod === "put" ? "PUT" : upload.file.uploadMethod,
        headers: { "Content-Type": object.mimeType },
        body,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to upload ${object.fileName}: ${response.status} ${response.statusText}`,
        );
      }
      return true;
    });

    discovered = await discoverUploadedObjects(
      skillImportId,
      new Set(pendingObjects.map((object) => object.logicalObjectId)),
    );
    const locatorFor = (logicalObjectId: string): StorageLocator => {
      const metadata = discovered.get(logicalObjectId);
      if (!metadata)
        throw new Error(`Missing uploaded object: ${logicalObjectId}`);
      return {
        projectId: metadata.projectId,
        environmentId: metadata.environmentId,
        accessKey: metadata.accessKey,
        fileKeyId: metadata.id,
      };
    };

    const uploadedFiles: UploadedSkillFile[] = originalDescriptors.map(
      ({ file, skillFileId, chunkCount }) => ({
        skillFileId,
        path: file.path,
        mimeType: file.mimeType,
        size: file.bytes.byteLength,
        sha256: file.sha256,
        isText: file.isText,
        lineCount: file.lineCount,
        isSymlink: file.isSymlink,
        lfsPointer: file.lfsPointer,
        chunkCount,
        ...locatorFor(`original:${skillFileId}`),
      }),
    );
    const uploadedChunks: UploadedSkillChunk[] = chunkDescriptors.map(
      ({ logicalObjectId, skillFileId, route, encoding }) => ({
        skillFileId,
        ...route,
        encoding,
        ...locatorFor(logicalObjectId),
      }),
    );
    return {
      files: uploadedFiles,
      chunks: uploadedChunks,
      chunkManifests,
      storageBytes:
        uploadedFiles.reduce((sum, file) => sum + file.size, 0) +
        uploadedChunks.reduce((sum, chunk) => sum + chunk.storedBytes, 0),
    };
  } catch (error) {
    if (discovered.size === 0) {
      discovered = await discoverUploadedObjects(
        skillImportId,
        new Set(),
      ).catch(() => new Map());
    }
    await deleteDiscoveredObjects(discovered);
    throw error;
  }
}

export async function storeSkillPackage(input: {
  replacingSkillId?: string;
  name: string;
  description: string;
  requestedSlug: string;
  entrypointText: string;
  metadataWasInferred: boolean;
  enabled: boolean;
  allowAutoLoad: boolean;
  source: SkillImportSource;
  files: SkillPackageFile[];
}) {
  const { userId } = await fetchAuthQuery(
    api.functions.user.getCurrentUserId,
    {},
  );
  const uploaded = await uploadSkillFiles(userId, input.files);
  try {
    return await fetchAuthMutation(
      api.functions.skills.backend_commitSkillImport,
      {
        secret: env.INTERNAL_CONVEX_SECRET,
        userId,
        replacingSkillId: input.replacingSkillId,
        name: input.name,
        description: input.description,
        requestedSlug: input.requestedSlug,
        entrypointText: input.entrypointText,
        metadataWasInferred: input.metadataWasInferred,
        enabled: input.enabled,
        allowAutoLoad: input.allowAutoLoad,
        source: input.source,
        files: uploaded.files,
        chunks: uploaded.chunks,
        chunkManifests: uploaded.chunkManifests,
        storageBytes: uploaded.storageBytes,
      },
    );
  } catch (error) {
    const siloCore = getSiloCore();
    await Promise.allSettled(
      [...uploaded.files, ...uploaded.chunks].map((file) =>
        siloCore.deleteFile({
          projectId: file.projectId,
          environmentId: file.environmentId,
          fileKeyId: file.fileKeyId,
          accessKey: file.accessKey,
        }),
      ),
    );
    throw error;
  }
}

export async function downloadPrivateSkillFile(input: {
  accessKey: string;
  fileKeyId: string;
  fileName: string;
}) {
  const siloCore = getSiloCore();
  const url = await siloCore.generateDownloadUrl({
    accessKey: input.accessKey,
    fileKeyId: input.fileKeyId,
    fileName: input.fileName,
    isPublic: false,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      clearTimeout(timeout);
      throw new Error(`Failed to read skill file: ${response.status}`);
    }
    if (!response.body) {
      clearTimeout(timeout);
      return response;
    }
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      pull: async (streamController) => {
        try {
          const result = await reader.read();
          if (result.done) {
            clearTimeout(timeout);
            streamController.close();
          } else {
            streamController.enqueue(result.value);
          }
        } catch (error) {
          clearTimeout(timeout);
          streamController.error(error);
        }
      },
      cancel: async (reason) => {
        clearTimeout(timeout);
        await reader.cancel(reason);
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
