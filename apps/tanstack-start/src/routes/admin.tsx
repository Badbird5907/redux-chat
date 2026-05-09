import { useState } from "react";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@redux/ui/components/sidebar";

import { AdminSidebarPanel } from "@/components/admin/sidebar-panel";
import { CommandPanel } from "@/components/command";
import {
  ModelSwitcherHotkeyRegistration,
  NewChatHotkeyRegistration,
  SidebarToggleHotkeyRegistration,
} from "@/lib/hotkeys";
import { fetchAdminDashboardAccess } from "@/server/admin/ensure-admin-access";
import { getSidebarConfig } from "@/server/cookie";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin | Redux Chat" }],
  }),
  beforeLoad: async ({ context }) => {
    const sidebarConfig = await getSidebarConfig();
    const [openState, savedWidth] = sidebarConfig?.split(":") ?? [];
    const defaultOpen =
      openState !== undefined ? openState === "true" : undefined;
    const defaultWidth = savedWidth;

    if (!context.isAuthenticated) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/auth/sign-in" });
    }
    const access = await fetchAdminDashboardAccess();
    if (!access.isAdmin) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/" });
    }

    return {
      defaultOpen,
      defaultWidth,
    };
  },
  component: AdminLayout,
});

function AdminTopLeftActions() {
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

function AdminLayout() {
  const { defaultOpen, defaultWidth } = Route.useRouteContext();
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
      <CommandPanel open={commandOpen} onOpenChange={setCommandOpen} />
      <NewChatHotkeyRegistration />
      <ModelSwitcherHotkeyRegistration />
      <SidebarToggleHotkeyRegistration />
      <AdminSidebarPanel />
      <main className="bg-muted/35 dark:bg-background flex h-screen w-screen flex-col p-2">
        <div className="bg-card/80 border-border/60 relative flex-1 overflow-hidden rounded-4xl border">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.16),transparent_58%)]" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-[radial-gradient(circle_at_top_right,hsl(var(--muted-foreground)/0.12),transparent_70%)]" />
          <AdminTopLeftActions />
          <div className="relative h-full overflow-y-auto px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}
