"use client";


import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@redux/ui/components/sidebar";

import { AppSidebarFooter } from "@/components/sidebar/footer";
import { Link } from "@tanstack/react-router";

export default function AppSidebar({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    <Sidebar className="border-none">
      <SidebarHeader className="pt-4">
        <Link to="/test_page" className="self-center text-2xl font-bold">
          <h1>
            <span className="font-audiowide">Redux.chat</span>
          </h1>
        </Link>
        <div className="mt-2 border-t" />
      </SidebarHeader>
      <SidebarContent
        className="scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </SidebarContent>
      <SidebarFooter>
        <div className="border-t" />
        <AppSidebarFooter />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
