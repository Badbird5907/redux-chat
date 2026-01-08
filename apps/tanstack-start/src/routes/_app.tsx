import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    if (!context.isAuthenticated) {
      throw redirect({
        to: "/auth/sign-in",
        search: { redirect: location.href },
      });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <SidebarProvider defaultOpen={true}>
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
  );
}
