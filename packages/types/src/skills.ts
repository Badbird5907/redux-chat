const MAX_ENTRYPOINT_BYTES = 128 * 1024;
const MAX_EXPLICIT_SKILLS = 5;

export const SKILL_LIMITS = {
  maxSkillsPerUser: 100,
  maxFilesPerSkill: 200,
  maxTotalBytes: 20 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
  maxEntrypointBytes: MAX_ENTRYPOINT_BYTES,
  maxNameLength: 80,
  maxDescriptionLength: 500,
  maxSlugLength: 48,
  maxPathLength: 512,
  maxExplicitSkills: MAX_EXPLICIT_SKILLS,
  maxCombinedEntrypointBytes: MAX_EXPLICIT_SKILLS * MAX_ENTRYPOINT_BYTES,
  maxReadLines: 400,
  maxReadBytes: 64 * 1024,
  chunkTargetBytes: 48 * 1024,
  chunkMaxLines: 400,
  maxReadPlanChunks: 3,
  maxProposalFiles: 25,
  maxProposalBytes: 256 * 1024,
  maxProposalFileBytes: 64 * 1024,
} as const;

export type SkillSourceType = "upload" | "github" | "model";
export type SkillActivationScope = "thread" | "message";
export type SkillUsageTrigger = "slash-message" | "slash-thread" | "auto";

export interface SkillSummary {
  skillId: string;
  name: string;
  description: string;
  slug: string;
  enabled: boolean;
  allowAutoLoad: boolean;
  sourceType: SkillSourceType;
  fileCount: number;
  totalBytes: number;
  metadataWasInferred: boolean;
  originalFileName?: string;
  github?: {
    originalUrl: string;
    owner: string;
    repository: string;
    requestedRef: string;
    selectedPath: string;
    commitSha: string;
  };
  createdAt: number;
  updatedAt: number;
}

export interface SkillFileSummary {
  skillFileId: string;
  path: string;
  mimeType: string;
  size: number;
  sha256: string;
  isText: boolean;
  lineCount?: number;
  isSymlink?: boolean;
  lfsPointer?: boolean;
}

export interface SkillRuntimeFileSummary {
  path: string;
  mimeType: string;
  size: number;
  isText: boolean;
  lineCount?: number;
}

export interface SkillProposalFileSummary {
  path: string;
  size: number;
  lineCount: number;
}

export type SkillChunkEncoding = "identity" | "gzip";

export interface SkillFileChunkRoute {
  chunkIndex: number;
  startLine: number;
  endLine: number;
  startByteInLine: number;
  endByteInLine: number;
  uncompressedBytes: number;
  storedBytes: number;
}

export interface SkillFileReadCursor {
  skillFileId: string;
  chunkIndex: number;
  byteOffset: number;
}
