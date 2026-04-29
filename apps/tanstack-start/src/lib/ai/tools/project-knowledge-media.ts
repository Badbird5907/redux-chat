import { getChatModelConfig } from "@redux/types";

export const MAX_PROJECT_MODEL_MEDIA_ATTACHMENTS = 2;

export interface ProjectMediaCandidate {
  attachmentId: string;
  mimeType: string;
  text?: string;
}

export function modelSupportsProjectMedia(modelId: string, mimeType: string) {
  const config = getChatModelConfig(modelId);
  if (!config) {
    return false;
  }

  if (mimeType === "application/pdf") {
    return config.allowedMimeTypes.includes("pdf");
  }

  if (mimeType.startsWith("image/")) {
    return config.allowedMimeTypes.includes("image");
  }

  return false;
}

export function selectProjectMediaAttachmentIds(
  candidates: ProjectMediaCandidate[],
  modelId: string,
  options?: {
    limit?: number;
    requireMissingText?: boolean;
  },
) {
  const limit = options?.limit ?? MAX_PROJECT_MODEL_MEDIA_ATTACHMENTS;
  const requireMissingText = options?.requireMissingText ?? false;
  const attachmentIds: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (requireMissingText && candidate.text?.trim()) {
      continue;
    }
    if (!modelSupportsProjectMedia(modelId, candidate.mimeType)) {
      continue;
    }
    if (seen.has(candidate.attachmentId)) {
      continue;
    }

    seen.add(candidate.attachmentId);
    attachmentIds.push(candidate.attachmentId);

    if (attachmentIds.length >= limit) {
      break;
    }
  }

  return attachmentIds;
}

export function toProjectToolModelOutputPart(input: {
  mimeType: string;
  url: string;
}) {
  return input.mimeType.startsWith("image/")
    ? {
        type: "image-url" as const,
        url: input.url,
      }
    : {
        type: "file-url" as const,
        url: input.url,
      };
}
