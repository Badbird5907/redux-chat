import {
  lookupMimeTypeFromFile,
} from "@silo-storage/mime-types";

export interface ChatModelConfig {
  id: string;
  name: string;
  provider: string;
  accept: string[];
  allowedMimeTypes: string[];
  maxFiles?: number;
}

// const IMAGE_MIME_TYPES = expandFileRouterInputKeyToMimeTypes("image");
// const VIDEO_MIME_TYPES = expandFileRouterInputKeyToMimeTypes("video");
// const AUDIO_MIME_TYPES = expandFileRouterInputKeyToMimeTypes("audio");
// const PDF_MIME_TYPES = expandFileRouterInputKeyToMimeTypes("pdf");
// const TEXT_MIME_TYPES = expandFileRouterInputKeyToMimeTypes("text");
const DOC_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export const CHAT_MODELS: ChatModelConfig[] = [
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    provider: "OpenAI",
    accept: ["image/*", ".pdf", ".txt", ".doc", ".docx"],
    // allowedMimeTypes: [...IMAGE_MIME_TYPES, ...PDF_MIME_TYPES, ...TEXT_MIME_TYPES, ...DOC_MIME_TYPES],
    allowedMimeTypes: ["image", "pdf", "text", ...DOC_MIME_TYPES],
    maxFiles: 4,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    accept: ["image/*", ".pdf", ".txt", ".doc", ".docx"],
    // allowedMimeTypes: [...IMAGE_MIME_TYPES, ...PDF_MIME_TYPES, ...TEXT_MIME_TYPES, ...DOC_MIME_TYPES],
    allowedMimeTypes: ["image", "pdf", "text", ...DOC_MIME_TYPES],
    maxFiles: 4,
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    accept: ["image/*", ".pdf", ".txt"],
    // allowedMimeTypes: [...IMAGE_MIME_TYPES, ...PDF_MIME_TYPES, ...TEXT_MIME_TYPES],
    allowedMimeTypes: ["image", "pdf", "text"],
    maxFiles: 4,
  },
  {
    id: "gemini-pro",
    name: "Gemini Pro",
    provider: "Google",
    accept: ["image/*", "video/*", ".pdf"],
    // allowedMimeTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES, ...PDF_MIME_TYPES],
    allowedMimeTypes: ["image", "video", "pdf"],
    maxFiles: 4,
  }
];

const CHAT_MODEL_CONFIG_BY_ID = new Map(
  CHAT_MODELS.map((model) => [model.id, model] as const),
);

export function getChatModelConfig(modelId: string): ChatModelConfig | undefined {
  return CHAT_MODEL_CONFIG_BY_ID.get(modelId);
}

export function getModelAttachmentExpects(modelId: string) {
  const config = getChatModelConfig(modelId);
  if (!config) {
    return [];
  }

  return [{
    mimeTypes: config.allowedMimeTypes,
    maxFileCount: config.maxFiles,
  }];
}

export function isFileAllowedForModel(
  modelId: string,
  file: { name: string; type: string },
): boolean {
  const config = getChatModelConfig(modelId);
  if (!config) {
    return false;
  }

  if (config.allowedMimeTypes.length === 0) {
    return false;
  }

  if (file.type && config.allowedMimeTypes.includes(file.type)) {
    return true;
  }

  const inferredMimeType = lookupMimeTypeFromFile(file.name, file.type);
  return inferredMimeType ? config.allowedMimeTypes.includes(inferredMimeType) : false;
}
