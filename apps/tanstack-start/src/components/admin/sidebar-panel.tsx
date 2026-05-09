import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, LayoutDashboard, Users } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@redux/ui/components/sidebar";

import AppSidebar from "@/components/sidebar";

export function AdminSidebarPanel() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const isOverviewActive = pathname === "/admin" || pathname === "/admin/";
  const isUsersActive = pathname.startsWith("/admin/users");

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
              isActive={isOverviewActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/admin" />}
            >
              <LayoutDashboard />
              <span>Overview</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={isUsersActive}
              className="data-active:bg-muted data-active:text-foreground hover:data-active:bg-muted w-full"
              render={<Link to="/admin/users" />}
            >
              <Users />
              <span>Users</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      }
    >
      {null}
    </AppSidebar>
  );
}
