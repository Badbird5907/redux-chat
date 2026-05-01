import { Link, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookText,
  FileText,
  Keyboard,
  PlugZap,
  Shield,
  SlidersHorizontal,
} from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@redux/ui/components/sidebar";

import AppSidebar from "@/components/sidebar";

export function SettingsSidebarPanel() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const isGeneralActive = pathname === "/settings" || pathname === "/settings/";
  const isSecurityActive = pathname.startsWith("/settings/security");
  const isInstructionsActive = pathname.startsWith("/settings/instructions");
  const isHotkeysActive = pathname.startsWith("/settings/hotkeys");
  const isAttachmentsActive = pathname.startsWith("/settings/attachments");
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
              <PlugZap />
              <span>MCP Servers</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isHotkeysActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/settings/hotkeys" />}
            >
              <Keyboard />
              <span>Hotkeys</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isAttachmentsActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/settings/attachments" />}
            >
              <FileText />
              <span>Attachments</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      }
    >
      {null}
    </AppSidebar>
  );
}
