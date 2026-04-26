export type MessageToolSettings = Record<string, unknown>;
export type LegacyMessageToolSettings = MessageToolSettings | string[];

export interface MessageSettings {
  model: string;
  tools: MessageToolSettings;
  [key: string]: unknown;
}

export interface MessageSettingsInput
  extends Omit<Partial<MessageSettings>, "tools"> {
  tools?: LegacyMessageToolSettings;
}

export type MessageSettingsPatch = Partial<Omit<MessageSettings, "tools">> & {
  tools?: MessageToolSettings;
};

export const DEFAULT_MESSAGE_SETTINGS: MessageSettings = {
  model: "gpt-5.4-mini",
  tools: {},
};

export function normalizeMessageSettings(
  input: MessageSettingsInput | null | undefined,
): MessageSettings {
  const { temperature: _temperature, ...rest } = input ?? {};

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
    tools: {
      ...normalizedBase.tools,
      ...normalizeTools(patch.tools),
    },
  });
}

function normalizeTools(
  tools: MessageToolSettings | string[] | null | undefined,
): MessageToolSettings {
  if (Array.isArray(tools)) {
    return Object.fromEntries(
      tools
        .filter((toolName): toolName is string => typeof toolName === "string")
        .map((toolName) => [toolName, true]),
    );
  }

  return tools && typeof tools === "object" ? { ...tools } : {};
}
