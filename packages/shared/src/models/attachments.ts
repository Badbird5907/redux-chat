import type { FileRouterInputKey } from "@silo-storage/mime-types";
import { expandFileRouterInputKeyToMimeTypes } from "@silo-storage/mime-types";

import type {
  AllowedMimeType,
  CuratedAttachmentOverride,
  ModelModalities,
} from "./types";

const MODALITY_TO_ACCEPT: Record<string, string> = {
  audio: "audio/*",
  image: "image/*",
  pdf: ".pdf",
  text: ".txt",
  video: "video/*",
};

const MODALITY_TO_ALLOWED_MIME_TYPE: Record<string, FileRouterInputKey> = {
  audio: "audio",
  image: "image",
  pdf: "pdf",
  text: "text",
  video: "video",
};

const FILE_ROUTER_INPUT_KEYS = new Set<FileRouterInputKey>([
  "audio",
  "image",
  "pdf",
  "text",
  "video",
]);

export function buildAcceptedFileTypes(
  modalities: ModelModalities,
  override?: CuratedAttachmentOverride,
) {
  const accept = new Set<string>();

  for (const modality of modalities.input) {
    const mappedAccept = MODALITY_TO_ACCEPT[modality];
    if (mappedAccept) {
      accept.add(mappedAccept);
    }
  }

  for (const extraAccept of override?.extraAccept ?? []) {
    accept.add(extraAccept);
  }

  return [...accept];
}

export function buildAllowedMimeTypes(
  modalities: ModelModalities,
  override?: CuratedAttachmentOverride,
): AllowedMimeType[] {
  const allowedMimeTypes = new Set<AllowedMimeType>();

  for (const modality of modalities.input) {
    const mappedMimeType = MODALITY_TO_ALLOWED_MIME_TYPE[modality];
    if (mappedMimeType) {
      allowedMimeTypes.add(mappedMimeType);
    }
  }

  for (const extraMimeType of override?.extraMimeTypes ?? []) {
    allowedMimeTypes.add(extraMimeType);
  }

  return [...allowedMimeTypes];
}

export function expandAllowedMimeTypes(allowedMimeTypes: AllowedMimeType[]) {
  const expanded = new Set<string>();

  for (const mimeType of allowedMimeTypes) {
    if (FILE_ROUTER_INPUT_KEYS.has(mimeType as FileRouterInputKey)) {
      for (const expandedMimeType of expandFileRouterInputKeyToMimeTypes(
        mimeType as FileRouterInputKey,
      )) {
        expanded.add(expandedMimeType);
      }
      continue;
    }

    expanded.add(mimeType);
  }

  return [...expanded];
}
