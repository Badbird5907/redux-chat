import { useState } from "react";
import {
  createFileRoute,
  Outlet,
  useRouteContext,
} from "@tanstack/react-router";

import { SidebarProvider } from "@redux/ui/components/sidebar";

import { CommandPanel } from "@/components/command";
import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";
import { TopLeftActions } from "@/components/layout/top-left-actions";
import { SettingsSidebarPanel } from "@/components/settings/sidebar-panel";
import {
  ModelSwitcherHotkeyRegistration,
  NewChatHotkeyRegistration,
  ReasoningLevelSelectorHotkeyRegistration,
  SidebarToggleHotkeyRegistration,
} from "@/lib/hotkeys";
import { getSidebarConfig } from "@/server/cookie";

function SettingsLayout() {
  const { defaultOpen, defaultWidth } = useRouteContext({ from: "/settings" });
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
      <CommandPanel open={commandOpen} onOpenChange={setCommandOpen} />
      <NewChatHotkeyRegistration />
      <ModelSwitcherHotkeyRegistration />
      <ReasoningLevelSelectorHotkeyRegistration />
      <SidebarToggleHotkeyRegistration />
      <SettingsSidebarPanel />
      <main className="bg-muted/35 dark:bg-background flex h-screen w-screen flex-col p-2">
        <div className="bg-page-card border-border/60 relative flex-1 overflow-hidden rounded-4xl border">
          <div className="max-md:hidden">
            <TopLeftActions />
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_58%)]" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,hsl(var(--muted-foreground)/0.12),transparent_70%)]" />
          <div className="relative h-full overflow-y-auto px-4 py-6 max-md:grid max-md:grid-cols-[auto_1fr] max-md:items-start max-md:gap-x-2 md:px-8 md:py-8">
            <MobileSidebarTrigger className="mt-0.5" />
            <Outlet />
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}

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
