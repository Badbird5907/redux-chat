import { useSidebar } from "@redux/ui/components/sidebar";

import { useAppHotkey } from "@/lib/hotkeys/use-app-hotkey";

export function SidebarToggleHotkeyRegistration() {
  const { toggleSidebar } = useSidebar();

  useAppHotkey("sidebar.toggle", () => {
    toggleSidebar();
  });

  return null;
}
