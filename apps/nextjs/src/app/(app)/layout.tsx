import { cookies } from "next/headers";

import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";

import { getToken } from "@/auth/server";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";
import { ConvexClientProvider } from "@/providers/convex";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const token = await getToken();
  const sidebarConfig = cookieStore.get("sidebar:config")?.value;
  const [openState, savedWidth] = sidebarConfig?.split(":") ?? [];
  const defaultOpen =
    openState !== undefined ? openState === "true" : undefined;
  const defaultWidth = savedWidth;

  return (
    <ConvexClientProvider initialToken={token}>
      <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
        <AppSidebar>
          <ThreadList />
        </AppSidebar>
        <div className="h-screen w-screen p-2">
          <div className="bg-card/80 h-full w-full rounded-4xl p-4">
            <div className="bg-card/80 flex w-fit items-center justify-between rounded-md p-1">
              <SidebarTrigger />
            </div>
            {children}
          </div>
        </div>
      </SidebarProvider>
    </ConvexClientProvider>
  );
}
