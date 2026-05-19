import { requestToggleModelSelector } from "@/components/chat/open-model-selector";
import { requestCloseReasoningLevelSelector } from "@/components/chat/open-reasoning-level-selector";
import { useAppHotkey } from "@/lib/hotkeys/use-app-hotkey";

export function ModelSwitcherHotkeyRegistration() {
  useAppHotkey("model.switcher.open", () => {
    requestCloseReasoningLevelSelector();
    requestToggleModelSelector();
  });

  return null;
}
