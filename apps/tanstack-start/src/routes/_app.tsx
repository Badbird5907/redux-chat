import type { ChatPreload } from "@/components/chat/preload";
import { useLayoutEffect } from "react";
import {
  createFileRoute,
  Outlet,
  useMatch,
  useRouterState,
} from "@tanstack/react-router";

import { SidebarProvider } from "@redux/ui/components/sidebar";

import { AdjacentAttachmentPanelLayout } from "@/components/chat/adjacent-attachment-panel-context";
import { AppChatRoute } from "@/components/chat/app-chat-route";
import { ChatRouteAdoptionProvider } from "@/components/chat/chat-route-adoption";
import { ChatTopBar } from "@/components/layout/chat-top-bar";
// import { getToken } from "@/lib/auth/server";
import { TopLeftActions } from "@/components/layout/top-left-actions";
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

function useAppDocumentScrollLock() {
  useLayoutEffect(() => {
    const { body, documentElement } = document;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscrollBehavior =
      documentElement.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;
    const previousBodyHeight = body.style.height;

    window.scrollTo(0, 0);
    documentElement.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    body.style.height = "100dvh";

    return () => {
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      body.style.height = previousBodyHeight;
    };
  }, []);
}

function AppLayout() {
  useAppDocumentScrollLock();

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
  const isPendingChatRoute =
    desiredChatThreadId !== undefined && chatMatchThreadId !== chatThreadId;
  const shouldRenderChatSurface =
    !isPendingChatRoute &&
    (chatThreadId !== undefined || homeLoaderData !== undefined);
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
      <SidebarProvider
        className="h-dvh max-h-dvh min-h-0 overflow-hidden overscroll-none"
        defaultOpen={defaultOpen}
        defaultWidth={defaultWidth}
      >
        <NewChatHotkeyRegistration />
        <ModelSwitcherHotkeyRegistration />
        <ReasoningLevelSelectorHotkeyRegistration />
        <SidebarToggleHotkeyRegistration />
        <AppSidebarPanel />
        <main className="bg-muted/35 dark:bg-background flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-none p-2">
          <AdjacentAttachmentPanelLayout>
            <div className="bg-page-card border-border/60 relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-none rounded-4xl border p-4">
              {chatThreadId !== undefined ? (
                <ChatTopBar threadId={chatThreadId} />
              ) : (
                <TopLeftActions />
              )}
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
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
          </AdjacentAttachmentPanelLayout>
        </main>
      </SidebarProvider>
    </ChatRouteAdoptionProvider>
  );
}
