import { requestOpenModelSelector } from "@/components/chat/open-model-selector";
import { useAppHotkey } from "@/lib/hotkeys/use-app-hotkey";

export function ModelSwitcherHotkeyRegistration() {
  useAppHotkey("model.switcher.open", () => {
    requestOpenModelSelector();
  });

  return null;
}
