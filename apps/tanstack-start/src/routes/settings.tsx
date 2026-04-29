import { useState } from "react";
import { createFileRoute, Outlet } from "@tanstack/react-router";

import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@redux/ui/components/sidebar";

import { CommandPanel } from "@/components/command";
import { SettingsSidebarPanel } from "@/components/settings/sidebar-panel";
import {
  NewChatHotkeyRegistration,
  SidebarToggleHotkeyRegistration,
} from "@/lib/hotkeys";
import { getSidebarConfig } from "@/server/cookie";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const sidebarConfig = await getSidebarConfig();
    const [openState, savedWidth] = sidebarConfig?.split(":") ?? [];
    const defaultOpen =
      openState !== undefined ? openState === "true" : undefined;
    const defaultWidth = savedWidth;

    return {
      defaultOpen,
      defaultWidth,
    };
  },
  component: SettingsLayout,
});

function SettingsTopLeftActions() {
  const { open: sidebarOpen } = useSidebar();

  if (sidebarOpen) {
    return null;
  }

  return (
    <div className="bg-card/85 absolute top-4 left-4 z-10 flex w-fit items-center justify-between rounded-md p-1 backdrop-blur">
      <SidebarTrigger />
    </div>
  );
}

function SettingsLayout() {
  const { defaultOpen, defaultWidth } = Route.useRouteContext();
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
      <CommandPanel open={commandOpen} onOpenChange={setCommandOpen} />
      <NewChatHotkeyRegistration />
      <SidebarToggleHotkeyRegistration />
      <SettingsSidebarPanel />
      <main className="flex h-screen w-screen flex-col p-2">
        <div className="bg-card/80 border-border/60 relative flex-1 overflow-hidden rounded-4xl border">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_58%)]" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,hsl(var(--muted-foreground)/0.12),transparent_70%)]" />
          <SettingsTopLeftActions />
          <div className="relative h-full overflow-y-auto px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}
