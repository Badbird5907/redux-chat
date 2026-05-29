import type { ThinkingLevel } from "@redux/shared/models";
import {
  DEFAULT_CHAT_MODEL_ID,
  getImageGenerationToolModels,
  normalizeModelId,
} from "@redux/shared/models";

export const MESSAGE_TOOL_NAMES = [
  "search",
  "bashWorkspace",
  "analysisWorkspace",
  "mcpServers",
  "imageGeneration",
] as const;

export type MessageToolName = (typeof MESSAGE_TOOL_NAMES)[number];
type MessageToolState<T> = T | false;
type MessageToolStateInput<T> = T | false | null | undefined;

export type SearchToolSettings = object;

export type BashWorkspaceToolSettings = object;

export interface AnalysisWorkspaceToolSettings {
  syncUploads?: boolean;
}

export interface AnalysisWorkspaceToolSettingsInput {
  syncUploads?: boolean;
}

export interface McpServersToolSettings {
  serverIds?: string[];
}

export interface McpServersToolSettingsInput {
  serverIds?: string[];
}

export interface ImageGenerationToolSettings {
  modelId?: string;
}

export interface ImageGenerationToolSettingsInput {
  modelId?: string;
}

export interface MessageToolSettings {
  search: MessageToolState<SearchToolSettings>;
  bashWorkspace: MessageToolState<BashWorkspaceToolSettings>;
  analysisWorkspace: MessageToolState<AnalysisWorkspaceToolSettings>;
  mcpServers: MessageToolState<McpServersToolSettings>;
  imageGeneration: MessageToolState<ImageGenerationToolSettings>;
}

export interface MessageToolSettingsInput {
  search?: MessageToolStateInput<SearchToolSettings>;
  bashWorkspace?: MessageToolStateInput<BashWorkspaceToolSettings>;
  analysisWorkspace?: MessageToolStateInput<AnalysisWorkspaceToolSettingsInput>;
  mcpServers?: MessageToolStateInput<McpServersToolSettingsInput>;
  imageGeneration?: MessageToolStateInput<ImageGenerationToolSettingsInput>;
}

/** Lines shown before collapsing user messages in chat. Use `0` to disable collapsing. */
export const DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES = 100;
const DEFAULT_IMAGE_GENERATION_MODEL_ID =
  getImageGenerationToolModels()[0]?.id;

function getDefaultEnabledTools(): MessageToolSettings {
  return {
    search: {},
    bashWorkspace: {},
    analysisWorkspace: {},
    mcpServers: {},
    imageGeneration: {},
  };
}

export interface MessageSettings {
  model: string;
  tools: MessageToolSettings;
  thinkingLevel?: ThinkingLevel;
  instructionId?: string;
  /** Max newline-separated lines before showing "Show more". `0` disables collapsing. */
  userMessagePreviewMaxLines?: number;
  [key: string]: unknown;
}

export interface MessageSettingsInput extends Omit<
  Partial<MessageSettings>,
  "tools"
> {
  tools?: MessageToolSettingsInput;
}

export type MessageSettingsPatch = Partial<Omit<MessageSettings, "tools">> & {
  tools?: MessageToolSettingsInput;
};

export const DEFAULT_MESSAGE_SETTINGS: MessageSettings = {
  model: DEFAULT_CHAT_MODEL_ID,
  tools: getDefaultEnabledTools(),
  instructionId: undefined,
  userMessagePreviewMaxLines: DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES,
};

function toolsInputForNormalization(
  input: MessageSettingsInput | null | undefined,
): MessageToolSettingsInput {
  if (input == null || !Object.prototype.hasOwnProperty.call(input, "tools")) {
    return getDefaultEnabledTools();
  }
  return input.tools ?? {};
}

export function normalizeMessageSettings(
  input: MessageSettingsInput | null | undefined,
): MessageSettings {
  const rest = input ?? {};
  const normalizedModel =
    typeof rest.model === "string"
      ? (normalizeModelId(rest.model) ?? DEFAULT_MESSAGE_SETTINGS.model)
      : DEFAULT_MESSAGE_SETTINGS.model;

  return {
    ...DEFAULT_MESSAGE_SETTINGS,
    ...rest,
    model: normalizedModel,
    thinkingLevel: normalizeThinkingLevel(rest.thinkingLevel),
    tools: normalizeTools(toolsInputForNormalization(input)),
    userMessagePreviewMaxLines: normalizeUserMessagePreviewMaxLines(
      rest.userMessagePreviewMaxLines,
    ),
  };
}

export function mergeMessageSettings(
  base: MessageSettingsInput | null | undefined,
  patch: MessageSettingsPatch | null | undefined,
): MessageSettings {
  const normalizedBase = normalizeMessageSettings(base);

  if (!patch) {
    return normalizedBase;
  }

  return normalizeMessageSettings({
    ...normalizedBase,
    ...patch,
    tools:
      patch.tools !== undefined
        ? normalizeTools({
            ...normalizedBase.tools,
            ...patch.tools,
          })
        : normalizedBase.tools,
  });
}

function normalizeThinkingLevel(value: unknown): ThinkingLevel | undefined {
  if (
    value === "instant" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  ) {
    return value;
  }

  return undefined;
}

function normalizeUserMessagePreviewMaxLines(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES;
  }
  const rounded = Math.round(value);
  if (rounded <= 0) {
    return 0;
  }
  return Math.min(50_000, Math.max(1, rounded));
}

function normalizeTools(
  tools: MessageToolSettingsInput | null | undefined,
): MessageToolSettings {
  const normalizedTools: MessageToolSettings = getDefaultEnabledTools();
  normalizedTools.search = normalizeSimpleToolState(tools?.search);
  normalizedTools.bashWorkspace = normalizeSimpleToolState(tools?.bashWorkspace);
  normalizedTools.analysisWorkspace = normalizeAnalysisWorkspaceToolState(
    tools?.analysisWorkspace,
  );
  normalizedTools.mcpServers = normalizeMcpServersToolState(tools?.mcpServers);
  normalizedTools.imageGeneration = normalizeImageGenerationToolState(
    tools?.imageGeneration,
  );

  return normalizedTools;
}

function normalizeSimpleToolState(value: unknown): object | false {
  if (value === false) {
    return false;
  }

  return {};
}

function normalizeAnalysisWorkspaceToolState(
  value: MessageToolStateInput<AnalysisWorkspaceToolSettingsInput>,
): AnalysisWorkspaceToolSettings | false {
  if (value === false) {
    return false;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.syncUploads === false) {
      return { syncUploads: false };
    }
  }

  return {};
}

function normalizeMcpServersToolState(
  value: MessageToolStateInput<McpServersToolSettingsInput>,
): McpServersToolSettings | false {
  if (value === false) {
    return false;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rawServerIds = Array.isArray(value.serverIds) ? value.serverIds : [];
    const serverIds = Array.from(
      new Set(
        rawServerIds.filter(
          (serverId): serverId is string =>
            typeof serverId === "string" && serverId.trim().length > 0,
        ),
      ),
    );

    if (serverIds.length > 0) {
      return { serverIds };
    }
  }

  return {};
}

function normalizeImageGenerationToolState(
  value: MessageToolStateInput<ImageGenerationToolSettingsInput>,
): ImageGenerationToolSettings | false {
  if (value === false) {
    return false;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const modelId =
      typeof value.modelId === "string" ? normalizeModelId(value.modelId) : null;
    if (modelId) {
      return { modelId };
    }
  }

  return {};
}

export function isToolEnabled(
  tools: MessageToolSettings,
  toolName: MessageToolName,
) {
  return tools[toolName] !== false;
}

export function getEnabledMessageTools(tools: MessageToolSettings) {
  return MESSAGE_TOOL_NAMES.filter((toolName) =>
    isToolEnabled(tools, toolName),
  );
}

export function getAnalysisWorkspaceSyncUploads(tools: MessageToolSettings) {
  const value = tools.analysisWorkspace;
  return value !== false && value.syncUploads !== false;
}

export function getImageGenerationToolModelId(tools: MessageToolSettings) {
  const value = tools.imageGeneration;
  if (value === false) {
    return undefined;
  }

  const explicitModelId =
    typeof value.modelId === "string" ? normalizeModelId(value.modelId) : null;
  return explicitModelId ?? DEFAULT_IMAGE_GENERATION_MODEL_ID;
}

export function getMcpServerIds(tools: MessageToolSettings): string[] {
  const value = tools.mcpServers;
  if (value === false) {
    return [];
  }

  return value.serverIds ?? [];
}
