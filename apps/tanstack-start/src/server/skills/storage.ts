import type { SkillPackageFile } from "@/server/skills/validation";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { getSiloCore } from "@/lib/silo/core.server";
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

interface UploadedSkillFile {
  skillFileId: string;
  path: string;
  mimeType: string;
  size: number;
  sha256: string;
  isText: boolean;
  lineCount?: number;
  isSymlink?: boolean;
  lfsPointer?: boolean;
  projectId: string;
  environmentId: string;
  accessKey: string;
  fileKeyId: string;
}

async function uploadSkillFiles(
  userId: string,
  files: SkillPackageFile[],
): Promise<UploadedSkillFile[]> {
  const siloCore = getSiloCore();
  const prepared = await mapWithConcurrency(files, 4, async (file) => {
    const fileName = file.path.split("/").at(-1) ?? "skill-file";
    const upload = await siloCore.prepareUpload({
      file: {
        fileName,
        size: file.bytes.byteLength,
        mimeType: file.mimeType,
        isPublic: false,
        serveImage: false,
        metadata: {
          userId,
          kind: "skill",
          path: file.path,
        },
      },
      uploadStrategy: "server",
      uploadMethod: "put",
    });
    return { file, upload };
  });

  try {
    await mapWithConcurrency(prepared, 4, async ({ file, upload }) => {
      const body = file.bytes.buffer.slice(
        file.bytes.byteOffset,
        file.bytes.byteOffset + file.bytes.byteLength,
      ) as ArrayBuffer;
      const response = await fetch(upload.file.uploadUrl, {
        method:
          upload.file.uploadMethod === "put" ? "PUT" : upload.file.uploadMethod,
        headers: { "Content-Type": file.mimeType },
        body,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to upload ${file.path}: ${response.status} ${response.statusText}`,
        );
      }
      return true;
    });

    const listed = await siloCore.listFiles({});
    const metadataById = new Map(
      listed.files.map((file) => [file.id, file] as const),
    );
    return prepared.map(({ file, upload }) => {
      const metadata = metadataById.get(upload.file.fileKeyId);
      if (!metadata) {
        throw new Error(`Uploaded metadata was not found for ${file.path}`);
      }
      return {
        skillFileId: crypto.randomUUID().replace(/-/g, "").slice(0, 22),
        path: file.path,
        mimeType: file.mimeType,
        size: file.bytes.byteLength,
        sha256: file.sha256,
        isText: file.isText,
        lineCount: file.lineCount,
        isSymlink: file.isSymlink,
        lfsPointer: file.lfsPointer,
        projectId: metadata.projectId,
        environmentId: metadata.environmentId,
        accessKey: upload.file.accessKey,
        fileKeyId: upload.file.fileKeyId,
      };
    });
  } catch (error) {
    const listed = await siloCore.listFiles({}).catch(() => ({ files: [] }));
    const metadataById = new Map(
      listed.files.map((file) => [file.id, file] as const),
    );
    await Promise.allSettled(
      prepared.map(({ upload }) => {
        const metadata = metadataById.get(upload.file.fileKeyId);
        if (!metadata) return Promise.resolve();
        return siloCore.deleteFile({
          projectId: metadata.projectId,
          environmentId: metadata.environmentId,
          fileKeyId: upload.file.fileKeyId,
          accessKey: upload.file.accessKey,
        });
      }),
    );
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
  const uploadedFiles = await uploadSkillFiles(userId, input.files);
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
        files: uploadedFiles,
      },
    );
  } catch (error) {
    const siloCore = getSiloCore();
    await Promise.allSettled(
      uploadedFiles.map((file) =>
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
