import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { ArrowLeft, FolderKanban } from "lucide-react";

import { useCurrentProject } from "@/lib/hooks/use-current-project";
import {
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@redux/ui/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";

// import { getToken } from "@/lib/auth/server";
import { AppSidebarPanel } from "@/components/sidebar/app-sidebar-panel";
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

function TopLeftActions() {
  const { open: sidebarOpen } = useSidebar();
  const { project, isChatRoute } = useCurrentProject();

  const projectBack =
    project && isChatRoute
      ? { id: project.projectId, name: project.name }
      : null;
  const showSidebarTrigger = !sidebarOpen;
  const showProjectBack = projectBack !== null;

  if (!showSidebarTrigger && !showProjectBack) {
    return null;
  }

  return (
    <div className="bg-card/80 absolute top-4 left-4 z-10 flex w-fit items-center justify-between gap-1 rounded-md p-1">
      {showSidebarTrigger && <SidebarTrigger />}
      {projectBack && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to="/projects/$id"
                params={{ id: projectBack.id }}
                aria-label={`Back to ${projectBack.name}`}
                className="group/project-link hover:bg-muted text-muted-foreground hover:text-foreground relative inline-flex size-8 items-center justify-center rounded-md transition-colors"
              />
            }
          >
            <FolderKanban className="absolute size-4 transition-all duration-200 group-hover/project-link:-translate-x-1 group-hover/project-link:scale-90 group-hover/project-link:opacity-0" />
            <ArrowLeft className="absolute size-4 translate-x-1 scale-90 opacity-0 transition-all duration-200 group-hover/project-link:translate-x-0 group-hover/project-link:scale-100 group-hover/project-link:opacity-100" />
          </TooltipTrigger>
          <TooltipContent side="right">{projectBack.name}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

function AppLayout() {
  const { defaultOpen, defaultWidth } = Route.useRouteContext();

  return (
    <SidebarProvider defaultOpen={defaultOpen} defaultWidth={defaultWidth}>
      <AppSidebarPanel />
      <main className="flex h-screen w-screen flex-col p-2">
        <div className="bg-card/80 relative w-full flex-1 overflow-hidden rounded-4xl p-4">
          <TopLeftActions />
          <div className="h-full overflow-hidden">
            <Outlet />
          </div>
        </div>
      </main>
    </SidebarProvider>
  );
}
