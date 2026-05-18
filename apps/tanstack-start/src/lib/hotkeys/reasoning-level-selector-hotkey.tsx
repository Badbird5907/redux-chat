import { requestOpenReasoningLevelSelector } from "@/components/chat/open-reasoning-level-selector";
import { useAppHotkey } from "@/lib/hotkeys/use-app-hotkey";

export function ReasoningLevelSelectorHotkeyRegistration() {
  useAppHotkey("reasoning.level.open", () => {
    requestOpenReasoningLevelSelector();
  });

  return null;
}
