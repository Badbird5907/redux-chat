import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookText,
  Keyboard,
  Palette,
  Shield,
  SlidersHorizontal,
} from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@redux/ui/components/sidebar";

import McpLogo from "@/components/logos/mcp";
import AppSidebar from "@/components/sidebar";

export function SettingsSidebarPanel() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const isGeneralActive = pathname === "/settings" || pathname === "/settings/";
  const isAppearanceActive = pathname.startsWith("/settings/appearance");
  const isSecurityActive = pathname.startsWith("/settings/security");
  const isInstructionsActive = pathname.startsWith("/settings/instructions");
  const isHotkeysActive = pathname.startsWith("/settings/hotkeys");
  const isMcpActive = pathname.startsWith("/settings/mcp");

  return (
    <AppSidebar
      header={
        <SidebarMenu className="mt-3 px-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/" />}
            >
              <ArrowLeft />
              <span>Back to Chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isGeneralActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/settings" />}
            >
              <SlidersHorizontal />
              <span>General</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isInstructionsActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/settings/instructions" />}
            >
              <BookText />
              <span>Instructions</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isAppearanceActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/settings/appearance" />}
            >
              <Palette />
              <span>Appearance</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isSecurityActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/settings/security" />}
            >
              <Shield />
              <span>Security</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isMcpActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/settings/mcp" />}
            >
              <McpLogo className="h-6 w-6 flex-shrink-0" />
              <span>MCP Servers</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="max-md:hidden">
            <SidebarMenuButton
              isActive={isHotkeysActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/settings/hotkeys" />}
            >
              <Keyboard />
              <span>Hotkeys</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      }
    >
      {null}
    </AppSidebar>
  );
}
