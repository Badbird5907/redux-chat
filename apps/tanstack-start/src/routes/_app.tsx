import type { ChatPreload } from "@/components/chat/preload";
import {
  createFileRoute,
  Outlet,
  useMatch,
  useRouterState,
} from "@tanstack/react-router";

import { SidebarProvider } from "@redux/ui/components/sidebar";

import { AppChatRoute } from "@/components/chat/app-chat-route";
import { ChatRouteAdoptionProvider } from "@/components/chat/chat-route-adoption";
// import { getToken } from "@/lib/auth/server";
import { TopLeftActions } from "@/components/layout/top-left-actions";
import { TopRightActions } from "@/components/layout/top-right-actions";
import { AppSidebarPanel } from "@/components/sidebar/app-sidebar-panel";
import {
  ModelSwitcherHotkeyRegistration,
  NewChatHotkeyRegistration,
  ReasoningLevelSelectorHotkeyRegistration,
  SidebarToggleHotkeyRegistration,
} from "@/lib/hotkeys";
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

function getChatThreadIdFromPathname(pathname: string) {
  const chatPrefix = "/chat/";

  if (!pathname.startsWith(chatPrefix)) {
    return undefined;
  }

  const threadId = pathname.slice(chatPrefix.length);
  return threadId.length > 0 ? decodeURIComponent(threadId) : undefined;
}

function AppLayout() {
  const { defaultOpen, defaultWidth } = Route.useRouteContext();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const chatMatch = useMatch({
    from: "/_app/chat/$id",
    shouldThrow: false,
  });
  const homeMatch = useMatch({
    from: "/_app/",
    shouldThrow: false,
  });
  const desiredChatThreadId = getChatThreadIdFromPathname(pathname);
  const isChatSurfaceRoute =
    pathname === "/" || desiredChatThreadId !== undefined;
  const chatMatchThreadId = chatMatch?.params.id;
  const chatThreadId = desiredChatThreadId ?? chatMatchThreadId;
  const homeLoaderData = homeMatch?.loaderData as
    | {
        settingsJson?: ChatPreload["settingsJson"];
      }
    | undefined;
  const shouldRenderChatSurface =
    chatThreadId !== undefined || homeLoaderData !== undefined;
  const chatPreload: ChatPreload | undefined =
    chatMatchThreadId === chatThreadId
      ? chatMatch?.loaderData
      : chatThreadId === undefined
        ? {
            settingsJson: homeLoaderData?.settingsJson ?? null,
          }
        : undefined;

  return (
    <ChatRouteAdoptionProvider>
      <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
        <NewChatHotkeyRegistration />
        <ModelSwitcherHotkeyRegistration />
        <ReasoningLevelSelectorHotkeyRegistration />
        <SidebarToggleHotkeyRegistration />
        <AppSidebarPanel />
        <main className="bg-muted/35 dark:bg-background flex h-screen w-screen flex-col p-2">
          <div className="bg-card/80 border-border/60 relative w-full flex-1 overflow-hidden rounded-4xl border p-4">
            <TopLeftActions />
            <TopRightActions />
            <div className="h-full overflow-hidden">
              {isChatSurfaceRoute ? (
                shouldRenderChatSurface ? (
                  <AppChatRoute
                    initialThreadId={chatThreadId}
                    preload={chatPreload}
                  />
                ) : null
              ) : (
                <Outlet />
              )}
            </div>
          </div>
        </main>
      </SidebarProvider>
    </ChatRouteAdoptionProvider>
  );
}
