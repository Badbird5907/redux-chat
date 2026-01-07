import { cookies } from "next/headers";

import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";

import { getToken } from "@/auth/server";
import { SettingsSidebar } from "@/components/sidebar/settings-sidebar";
import { ConvexClientProvider } from "@/providers/convex";

export default async function SettingsLayout({
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
        <SettingsSidebar />
        <div className="h-screen w-screen flex flex-col p-2">
          <div className="bg-card/80 flex-1 w-full rounded-4xl p-8 overflow-y-auto">
            <div className="bg-card/80 flex w-fit items-center justify-between rounded-md p-1 mb-6">
              <SidebarTrigger />
            </div>
            <div className="max-w-4xl mx-auto">
              {children}
            </div>
          </div>
        </div>
      </SidebarProvider>
    </ConvexClientProvider>
  );
}
