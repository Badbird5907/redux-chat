import { useNavigate } from "@tanstack/react-router";

import { requestChatReset } from "@/components/chat/reset-chat";
import { useAppHotkey } from "@/lib/hotkeys/use-app-hotkey";

export function NewChatHotkeyRegistration() {
  const navigate = useNavigate();

  useAppHotkey("chat.new", () => {
    requestChatReset();
    void navigate({ to: "/" });
  });

  return null;
}
