import { requestCloseModelSelector } from "@/components/chat/open-model-selector";
import { requestToggleReasoningLevelSelector } from "@/components/chat/open-reasoning-level-selector";
import { useAppHotkey } from "@/lib/hotkeys/use-app-hotkey";

export function ReasoningLevelSelectorHotkeyRegistration() {
  useAppHotkey("reasoning.level.open", () => {
    requestCloseModelSelector();
    requestToggleReasoningLevelSelector();
  });

  return null;
}
