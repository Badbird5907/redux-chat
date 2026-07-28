export const SKILL_LIMITS = {
  maxSkillsPerUser: 100,
  maxFilesPerSkill: 200,
  maxTotalBytes: 20 * 1024 * 1024,
  maxFileBytes: 5 * 1024 * 1024,
  maxEntrypointBytes: 128 * 1024,
  maxNameLength: 80,
  maxDescriptionLength: 500,
  maxSlugLength: 48,
  maxPathLength: 512,
  maxExplicitSkills: 5,
  maxCombinedEntrypointBytes: 128 * 1024,
  maxReadLines: 400,
  maxReadBytes: 64 * 1024,
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
