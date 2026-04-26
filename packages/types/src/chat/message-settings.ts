export const MESSAGE_TOOL_NAMES = ["search"] as const;

export type MessageToolName = (typeof MESSAGE_TOOL_NAMES)[number];

export type SearchToolSettings = object 

export interface MessageToolSettings {
  search?: SearchToolSettings;
}

export interface MessageSettings {
  model: string;
  tools: MessageToolSettings;
  [key: string]: unknown;
}

export interface MessageSettingsInput extends Omit<
  Partial<MessageSettings>,
  "tools"
> {
  tools?: Partial<MessageToolSettings>;
}

export type MessageSettingsPatch = Partial<Omit<MessageSettings, "tools">> & {
  tools?: Partial<MessageToolSettings>;
};

export const DEFAULT_MESSAGE_SETTINGS: MessageSettings = {
  model: "gpt-5.4-mini",
  tools: {},
};

export function normalizeMessageSettings(
  input: MessageSettingsInput | null | undefined,
): MessageSettings {
  const rest = input ?? {};

  return {
    ...DEFAULT_MESSAGE_SETTINGS,
    ...rest,
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
        ? normalizeTools(patch.tools)
        : normalizedBase.tools,
  });
}

function normalizeTools(
  tools: Partial<MessageToolSettings> | null | undefined,
): MessageToolSettings {
  const normalizedTools: MessageToolSettings = {};

  if (
    tools?.search &&
    typeof tools.search === "object" &&
    !Array.isArray(tools.search)
  ) {
    normalizedTools.search = {};
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
