import { Outlet, createFileRoute } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useRouteContext } from "@tanstack/react-router";

import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context }) => {
    if (!context.isAuthenticated) {
      throw new Response("Unauthorized", { status: 401 });
    }
    return {};
  },
  component: AppLayout,
});

function AppLayout() {
  const context = useRouteContext({ from: Route.id });
  
  return (
    <ConvexBetterAuthProvider
      client={context.convexQueryClient.convexClient}
      authClient={context.authClient}
      initialToken={context.token}
    >
      <SidebarProvider>
        <AppSidebar>
          <ThreadList />
        </AppSidebar>
        <div className="h-screen w-screen flex flex-col p-2">
          <div className="bg-card/80 flex-1 w-full rounded-4xl p-4 overflow-hidden">
            <div className="bg-card/80 flex w-fit items-center justify-between rounded-md p-1">
              <SidebarTrigger />
            </div>
            <Outlet />
          </div>
        </div>
      </SidebarProvider>
    </ConvexBetterAuthProvider>
  );
}