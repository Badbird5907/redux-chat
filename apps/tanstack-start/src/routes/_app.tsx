import { createFileRoute, useRouter, useRouterState } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@redux/ui/components/sidebar";
// import { getToken } from "@/lib/auth/server";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";
import { getSidebarConfig } from "@/server/cookie";
import { Button } from "@redux/ui/components/button";
import { ButtonGroup } from "@redux/ui/components/button-group";
import { Search } from "lucide-react";
import { CommandPanel } from "@/components/command";
import { formatForDisplay } from "@tanstack/react-hotkeys";

const ChatRouteClient = lazy(() => import("@/components/chat/route-client"));

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
  const router = useRouter();
  const [commandOpen, setCommandOpen] = useState(false);
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const initialThreadId = useMemo(() => {
    const match = /^\/chat\/([^/]+)$/.exec(pathname);
    return match?.[1] ? decodeURIComponent(match[1]) : undefined;
  }, [pathname]);

  return (
    <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
      <CommandPanel open={commandOpen} onOpenChange={setCommandOpen} />
      <AppSidebar
        header={
          <>
            <ButtonGroup className="w-full min-w-0">
              <Button
                className="min-w-0 flex-1 shrink"
                onClick={() => router.navigate({ to: "/" })}
              >
                New Chat
              </Button>

              <Button
                size="icon"
                aria-label="Search threads"
                tooltip={`Search threads ${formatForDisplay("Mod+K")}`}
                onClick={() => setCommandOpen(true)}
              >
                <Search />
              </Button>
            </ButtonGroup>
          </>
        }
      >
        <ThreadList />
      </AppSidebar>
      <div className="flex h-screen w-screen flex-col p-2">
        <div className="bg-card/80 relative w-full flex-1 overflow-hidden rounded-4xl p-4">
          <div className="bg-card/80 absolute top-4 left-4 z-10 flex w-fit items-center justify-between rounded-md p-1">
            <SidebarTrigger />
          </div>
          <div className="h-full overflow-hidden">
            <Suspense fallback={null}>
              <ChatRouteClient
                initialThreadId={initialThreadId}
                preload={undefined}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
