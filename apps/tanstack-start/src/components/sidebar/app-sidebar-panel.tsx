import { Link, useRouterState } from "@tanstack/react-router";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { CornerDownRight, FolderKanban, Plus, Search } from "lucide-react";
import { useState } from "react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@redux/ui/components/sidebar";

import { CommandPanel } from "@/components/command";
import { requestChatReset } from "@/components/chat/reset-chat";
import AppSidebar from "@/components/sidebar";
import ThreadList from "@/components/sidebar/chat/thread-list";
import { useResolvedHotkey } from "@/lib/hotkeys";
import { useCurrentProject } from "@/lib/hooks/use-current-project";
import { CommandShortcut } from "@redux/ui/components/command";

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
                <span>New Chat</span>
                <CommandShortcut className="opacity-0 transition-opacity group-hover/menu-item:opacity-100">
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
                <span>Search</span>
                <CommandShortcut className="opacity-0 transition-opacity group-hover/menu-item:opacity-100">
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
                <span>Projects</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              {project.project && (
                <SidebarMenuButton
                  size="sm"
                  className="ml-8 h-7 w-[calc(100%-2rem)] rounded-md px-2 text-xs font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground data-active:bg-transparent data-active:text-muted-foreground data-active:font-normal [&_svg]:size-3.5"
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
