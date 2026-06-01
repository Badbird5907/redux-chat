import { useState } from "react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { Link, useRouterState } from "@tanstack/react-router";
import { CornerDownRight, FolderKanban, Plus, Search } from "lucide-react";

import { CommandShortcut } from "@redux/ui/components/command";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@redux/ui/components/sidebar";

import { requestChatReset } from "@/components/chat/reset-chat";
import { CommandPanel } from "@/components/command";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";
import { useCurrentProject } from "@/lib/hooks/use-current-project";
import { useResolvedHotkey } from "@/lib/hotkeys";

export function AppSidebarPanel() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [commandOpen, setCommandOpen] = useState(false);
  const commandHotkey = useResolvedHotkey("command.open");
  const newChatHotkey = useResolvedHotkey("chat.new");

  const isNewChatActive = pathname === "/";
  const isProjectsActive =
    pathname === "/projects" || pathname.startsWith("/projects/");
  const project = useCurrentProject();

  return (
    <>
      <CommandPanel open={commandOpen} onOpenChange={setCommandOpen} />
      <AppSidebar
        header={
          <SidebarMenu className="mt-3 px-2">
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isNewChatActive}
                className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
                render={
                  <Link
                    to="/"
                    onClick={() => {
                      requestChatReset();
                    }}
                  />
                }
              >
                <Plus />
                <span className="min-w-0 truncate">New Chat</span>
                <CommandShortcut className="ml-auto hidden shrink-0 group-hover/menu-item:inline-flex">
                  {formatForDisplay(newChatHotkey)}
                </CommandShortcut>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-label="Search threads"
                // tooltip={`Search threads (${formatForDisplay("Mod+K")})`}
                className="w-full"
                onClick={() => setCommandOpen(true)}
              >
                <Search />
                <span className="min-w-0 truncate">Search</span>
                <CommandShortcut className="ml-auto hidden shrink-0 group-hover/menu-item:inline-flex">
                  {formatForDisplay(commandHotkey)}
                </CommandShortcut>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={isProjectsActive}
                className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
                render={<Link to="/projects" />}
              >
                <FolderKanban />
                <span className="min-w-0 truncate">Projects</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              {project.project && (
                <SidebarMenuButton
                  size="sm"
                  className="text-muted-foreground hover:bg-muted/50 hover:text-foreground data-active:text-muted-foreground ml-8 h-7 w-[calc(100%-2rem)] rounded-md px-2 text-xs font-normal data-active:bg-transparent data-active:font-normal [&_svg]:size-3.5"
                  render={
                    <Link
                      to="/projects/$id"
                      params={{ id: project.project.projectId }}
                    />
                  }
                >
                  <CornerDownRight />
                  <span>{project.project.name}</span>
                </SidebarMenuButton>
              )}
            </SidebarMenuItem>
          </SidebarMenu>
        }
      >
        <ThreadList />
      </AppSidebar>
    </>
  );
}
