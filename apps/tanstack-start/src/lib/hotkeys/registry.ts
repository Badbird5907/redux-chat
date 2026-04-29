import type { Hotkey, UseHotkeyOptions } from "@tanstack/react-hotkeys";

export type AppHotkeyBinding = Hotkey;

export interface AppHotkeyDefinition {
  id: string;
  label: string;
  description: string;
  category: string;
  defaultHotkey: AppHotkeyBinding;
  options?: UseHotkeyOptions;
}

function defineAppHotkeys<
  TDefinitions extends Record<string, Omit<AppHotkeyDefinition, "id">>,
>(definitions: TDefinitions) {
  return Object.fromEntries(
    Object.entries(definitions).map(([id, definition]) => [
      id,
      { ...definition, id },
    ]),
  ) as {
    [TKey in keyof TDefinitions]: AppHotkeyDefinition & { id: TKey };
  };
}

export const appHotkeyRegistry = defineAppHotkeys({
  "command.open": {
    label: "Open command palette",
    description: "Launch the global command palette and search recent threads.",
    category: "Workspace",
    defaultHotkey: "Mod+K",
  },
  "sidebar.toggle": {
    label: "Toggle sidebar",
    description: "Collapse or expand the app sidebar from anywhere in the shell.",
    category: "Navigation",
    defaultHotkey: "Mod+B",
  },
  "chat.new": {
    label: "New chat",
    description: "Open a fresh chat on the home route.",
    category: "Navigation",
    defaultHotkey: "Mod+Shift+O",
  },
});

export type AppHotkeyId = keyof typeof appHotkeyRegistry;

export const appHotkeyIds = Object.keys(appHotkeyRegistry) as AppHotkeyId[];

export const appHotkeyDefinitions = appHotkeyIds.map(
  (id) => appHotkeyRegistry[id],
);

export function getDefaultHotkeyBindings() {
  return Object.fromEntries(
    appHotkeyIds.map((id) => [id, appHotkeyRegistry[id].defaultHotkey]),
  ) as Record<AppHotkeyId, AppHotkeyBinding>;
}
