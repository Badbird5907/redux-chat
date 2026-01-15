import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";
// import { getToken } from "@/lib/auth/server";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";
import { getSidebarConfig } from "@/server/cookie";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    // const token = await getToken();
    const sidebarConfig = await getSidebarConfig();
    const [openState, savedWidth] = sidebarConfig?.split(":") ?? [];
    const defaultOpen =
      openState !== undefined ? openState === "true" : undefined;
    const defaultWidth = savedWidth;
    return {
      // token,
      defaultOpen,
      defaultWidth,
    };
  },
  component: AppLayout,
});

function AppLayout() {
  const { defaultOpen, defaultWidth } = Route.useRouteContext();

  return (
    <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
      <AppSidebar>
        <ThreadList />
      </AppSidebar>
      <div className="h-screen w-screen flex flex-col p-2">
        <div className="bg-card/80 relative flex-1 w-full rounded-4xl p-4 overflow-hidden">
          <div className="absolute top-4 left-4 z-10 bg-card/80 flex w-fit items-center justify-between rounded-md p-1">
            <SidebarTrigger />
          </div>
          <div className="h-full overflow-hidden">
            <Outlet />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
