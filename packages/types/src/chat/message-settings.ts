import type { ThinkingLevel } from "@redux/shared/models";
import {
  DEFAULT_CHAT_MODEL_ID,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  isImageGenerationToolModel,
  normalizeModelId,
} from "@redux/shared/models";

export const MESSAGE_TOOL_NAMES = [
  "search",
  "bashWorkspace",
  "analysisWorkspace",
  "mcpServers",
  "imageGeneration",
] as const;
const LEGACY_ABSENT_MEANS_DISABLED_TOOL_NAMES = [
  "search",
  "bashWorkspace",
  "analysisWorkspace",
] as const;

export type MessageToolName = (typeof MESSAGE_TOOL_NAMES)[number];

export type SearchToolSettings = Record<string, never>;

export type BashWorkspaceToolSettings = Record<string, never>;

export interface AnalysisWorkspaceToolSettings {
  syncUploads: boolean;
}

export interface AnalysisWorkspaceToolSettingsInput {
  syncUploads?: boolean;
}

export interface McpServersToolSettings {
  serverIds: string[];
}

export interface McpServersToolSettingsInput {
  serverIds?: string[] | null;
}

export interface ImageGenerationToolSettings {
  modelId: string;
}

export interface ImageGenerationToolSettingsInput {
  modelId?: string | null;
}

export interface MessageToolSettingsByName {
  search: SearchToolSettings;
  bashWorkspace: BashWorkspaceToolSettings;
  analysisWorkspace: AnalysisWorkspaceToolSettings;
  mcpServers: McpServersToolSettings;
  imageGeneration: ImageGenerationToolSettings;
}

export interface MessageToolSettingsInputByName {
  search: SearchToolSettings;
  bashWorkspace: BashWorkspaceToolSettings;
  analysisWorkspace: AnalysisWorkspaceToolSettingsInput;
  mcpServers: McpServersToolSettingsInput;
  imageGeneration: ImageGenerationToolSettingsInput;
}

export type MessageToolSetting<T> = T | false;

export type MessageToolSettings = {
  [ToolName in MessageToolName]: MessageToolSetting<
    MessageToolSettingsByName[ToolName]
  >;
};

export type MessageToolSettingsInput = Partial<{
  [ToolName in MessageToolName]:
    | MessageToolSettingsInputByName[ToolName]
    | false
    | null;
}>;

/** Lines shown before collapsing user messages in chat. Use `0` to disable collapsing. */
export const DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES = 100;

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
  tools?: MessageToolSettingsInput | null;
}

export type MessageSettingsPatch = Partial<Omit<MessageSettings, "tools">> & {
  tools?: MessageToolSettingsInput | null;
};

export const DEFAULT_MESSAGE_SETTINGS: MessageSettings = {
  model: DEFAULT_CHAT_MODEL_ID,
  tools: {
    search: {},
    bashWorkspace: {},
    analysisWorkspace: { syncUploads: true },
    mcpServers: { serverIds: [] },
    imageGeneration: { modelId: DEFAULT_IMAGE_GENERATION_MODEL_ID },
  },
  instructionId: undefined,
  userMessagePreviewMaxLines: DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOwnKey(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function normalizeMessageSettings(
  input: MessageSettingsInput | null | undefined,
): MessageSettings {
  return normalizeMessageSettingsWithTools(input, normalizeTools(input?.tools));
}

export function normalizePersistedMessageSettings(
  input: MessageSettingsInput | null | undefined,
): MessageSettings {
  return normalizeMessageSettingsWithTools(
    input,
    normalizePersistedTools(input?.tools),
  );
}

function normalizeMessageSettingsWithTools(
  input: MessageSettingsInput | null | undefined,
  tools: MessageToolSettings,
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
    tools,
    userMessagePreviewMaxLines: normalizeUserMessagePreviewMaxLines(
      rest.userMessagePreviewMaxLines,
    ),
  };
}

export function mergeMessageSettings(
  base: MessageSettingsInput | null | undefined,
  patch: MessageSettingsPatch | null | undefined,
): MessageSettings {
  return mergeMessageSettingsWithNormalizedBase(
    normalizeMessageSettings(base),
    patch,
  );
}

export function mergePersistedMessageSettings(
  base: MessageSettingsInput | null | undefined,
  patch: MessageSettingsPatch | null | undefined,
): MessageSettings {
  return mergeMessageSettingsWithNormalizedBase(
    normalizePersistedMessageSettings(base),
    patch,
  );
}

function mergeMessageSettingsWithNormalizedBase(
  normalizedBase: MessageSettings,
  patch: MessageSettingsPatch | null | undefined,
): MessageSettings {
  if (!patch) {
    return normalizedBase;
  }

  return normalizeMessageSettings({
    ...normalizedBase,
    ...patch,
    tools:
      patch.tools !== undefined
        ? normalizeTools(
            patch.tools === null
              ? null
              : {
                  ...normalizedBase.tools,
                  ...patch.tools,
                },
          )
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

export function normalizeTools(
  tools: MessageToolSettings | MessageToolSettingsInput | null | undefined,
): MessageToolSettings {
  return {
    search: tools?.search === false ? false : {},
    bashWorkspace: tools?.bashWorkspace === false ? false : {},
    analysisWorkspace:
      tools?.analysisWorkspace === false
        ? false
        : {
            syncUploads:
              isRecord(tools?.analysisWorkspace) &&
              tools.analysisWorkspace.syncUploads === false
                ? false
                : true,
          },
    mcpServers:
      tools?.mcpServers === false
        ? false
        : {
            serverIds: normalizeMcpServerIds(
              isRecord(tools?.mcpServers)
                ? tools.mcpServers.serverIds
                : undefined,
            ),
          },
    imageGeneration:
      tools?.imageGeneration === false
        ? false
        : {
            modelId: normalizeImageGenerationModelId(
              isRecord(tools?.imageGeneration)
                ? tools.imageGeneration.modelId
                : undefined,
            ),
          },
  };
}

export function normalizePersistedTools(
  tools: MessageToolSettings | MessageToolSettingsInput | null | undefined,
): MessageToolSettings {
  const normalizedTools = normalizeTools(tools);

  if (!isRecord(tools)) {
    return normalizedTools;
  }

  for (const toolName of LEGACY_ABSENT_MEANS_DISABLED_TOOL_NAMES) {
    if (!hasOwnKey(tools, toolName)) {
      normalizedTools[toolName] = false;
    }
  }

  return normalizedTools;
}

export function isToolEnabled(
  tools: MessageToolSettings | MessageToolSettingsInput | null | undefined,
  toolName: MessageToolName,
) {
  return tools?.[toolName] !== false;
}

export function getEnabledMessageTools(tools: MessageToolSettings) {
  return MESSAGE_TOOL_NAMES.filter((toolName) =>
    isToolEnabled(tools, toolName),
  );
}

export function getEnabledToolSettings<ToolName extends MessageToolName>(
  tools: MessageToolSettings | MessageToolSettingsInput | null | undefined,
  toolName: ToolName,
): MessageToolSettingsByName[ToolName] | undefined {
  const value = normalizeTools(tools)[toolName];

  if (value === false) {
    return undefined;
  }

  return value as MessageToolSettingsByName[ToolName];
}

function normalizeMcpServerIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (serverId): serverId is string =>
          typeof serverId === "string" && serverId.trim().length > 0,
      ),
    ),
  );
}

function normalizeImageGenerationModelId(value: unknown) {
  const modelId =
    typeof value === "string" ? normalizeModelId(value) : undefined;

  return modelId && isImageGenerationToolModel(modelId)
    ? modelId
    : DEFAULT_IMAGE_GENERATION_MODEL_ID;
}
