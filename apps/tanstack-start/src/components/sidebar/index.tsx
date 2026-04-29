import { Link } from "@tanstack/react-router";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarTrigger,
} from "@redux/ui/components/sidebar";

import { AppSidebarFooter } from "@/components/sidebar/footer";

export default function AppSidebar({
  children,
  header,
}: {
  children: React.ReactNode;
  header: React.ReactNode;
}) {
  return (
    <Sidebar className="border-none">
      <SidebarHeader className="pt-4">
        <div className="relative flex w-full items-center justify-center">
          <div className="absolute top-1/2 left-0 z-10 -translate-y-1/2">
            <SidebarTrigger />
          </div>
          <Link to="/" className="inline-block text-xl font-bold">
            <h1>
              <span className="font-audiowide">Redux.chat</span>
            </h1>
          </Link>
        </div>
        {header}
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
