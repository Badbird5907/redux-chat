import { createFileRoute } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";

import { getToken } from "@/lib/auth-server";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";
import { ConvexClientProvider } from "@/providers/convex";
import { Authenticated } from "./authenticated";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
  beforeLoad: async () => {
    // Check if user is authenticated
    const token = await getToken();
    if (!token) {
      // Redirect to sign in if not authenticated
      throw new Response("Unauthorized", { status: 401 });
    }
    return { token };
  },
});

function AppLayout({ children }: { children: React.ReactNode }) {
  // This layout mimics the Next.js (app) layout
  return (
    <SidebarProvider>
      <AppSidebar>
        <ThreadList />
      </AppSidebar>
      <ConvexClientProvider>
        <div className="h-screen w-screen flex flex-col p-2">
          <div className="bg-card/80 flex-1 w-full rounded-4xl p-4 overflow-hidden">
            <div className="bg-card/80 flex w-fit items-center justify-between rounded-md p-1">
              <SidebarTrigger />
            </div>
            {children}
          </div>
        </div>
      </ConvexClientProvider>
    </SidebarProvider>
  );
}