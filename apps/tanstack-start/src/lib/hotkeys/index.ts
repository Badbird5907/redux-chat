export {
  appHotkeyDefinitions,
  appHotkeyIds,
  appHotkeyRegistry,
} from "@/lib/hotkeys/registry";
export {
  HotkeySettingsProvider,
  useHotkeySettings,
  useResolvedHotkey,
} from "@/lib/hotkeys/provider";
export { ModelSwitcherHotkeyRegistration } from "@/lib/hotkeys/model-switcher-hotkey";
export { ReasoningLevelSelectorHotkeyRegistration } from "@/lib/hotkeys/reasoning-level-selector-hotkey";
export { NewChatHotkeyRegistration } from "@/lib/hotkeys/new-chat-hotkey";
export { SidebarToggleHotkeyRegistration } from "@/lib/hotkeys/sidebar-toggle-hotkey";
export { useAppHotkey } from "@/lib/hotkeys/use-app-hotkey";
export type {
  AppHotkeyBinding,
  AppHotkeyDefinition,
  AppHotkeyId,
} from "@/lib/hotkeys/registry";
