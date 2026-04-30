import { DEFAULT_CHAT_MODEL_ID, normalizeModelId } from "@redux/shared/models";

export const MESSAGE_TOOL_NAMES = [
  "search",
  "analysisWorkspace",
  "mcpServers",
] as const;

export type MessageToolName = (typeof MESSAGE_TOOL_NAMES)[number];

export type SearchToolSettings = object;

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
  serverIds: string[];
}

export interface MessageToolSettings {
  search?: SearchToolSettings;
  analysisWorkspace?: AnalysisWorkspaceToolSettings;
  mcpServers?: McpServersToolSettings;
}

export interface MessageToolSettingsInput {
  search?: SearchToolSettings;
  analysisWorkspace?: AnalysisWorkspaceToolSettingsInput;
  mcpServers?: McpServersToolSettingsInput;
}

export interface MessageSettings {
  model: string;
  tools: MessageToolSettings;
  instructionId?: string;
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
  tools: {},
  instructionId: undefined,
};

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
    tools: normalizeTools(input?.tools),
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

function normalizeTools(
  tools: MessageToolSettingsInput | null | undefined,
): MessageToolSettings {
  const normalizedTools: MessageToolSettings = {};

  if (
    tools?.search &&
    typeof tools.search === "object" &&
    !Array.isArray(tools.search)
  ) {
    normalizedTools.search = {};
  }

  if (
    tools?.analysisWorkspace &&
    typeof tools.analysisWorkspace === "object" &&
    !Array.isArray(tools.analysisWorkspace)
  ) {
    normalizedTools.analysisWorkspace = {
      syncUploads: tools.analysisWorkspace.syncUploads !== false,
    };
  }

  if (
    tools?.mcpServers &&
    typeof tools.mcpServers === "object" &&
    !Array.isArray(tools.mcpServers)
  ) {
    const serverIds = Array.from(
      new Set(
        (tools.mcpServers.serverIds ?? []).filter(
          (serverId): serverId is string =>
            typeof serverId === "string" && serverId.trim().length > 0,
        ),
      ),
    );

    if (serverIds.length > 0) {
      normalizedTools.mcpServers = { serverIds };
    }
  }

  return normalizedTools;
}

export function isToolEnabled(
  tools: MessageToolSettings,
  toolName: MessageToolName,
) {
  return tools[toolName] !== undefined;
}

export function getEnabledMessageTools(tools: MessageToolSettings) {
  return MESSAGE_TOOL_NAMES.filter((toolName) =>
    isToolEnabled(tools, toolName),
  );
}
