"use client";

import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@redux/ui/components/sidebar";
import { Skeleton } from "@redux/ui/components/skeleton";

import { authClient } from "@/auth/client";
import { UserAvatar } from "@/components/user-avatar";
import { LogOut, Settings } from "lucide-react";

export default function AppSidebar({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  return (
    <Sidebar className="">
      <SidebarHeader className="pt-4">
        <Link href="/" className="self-center text-2xl font-bold">
          <h1>
            <span className="font-audiowide">Redux.chat</span>
          </h1>
        </Link>
        <div className="border-t mt-2" />
      </SidebarHeader>
      <SidebarContent
        className="scrollbar-none"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </SidebarContent>
      <SidebarFooter>
        <div className="border-t" />
        {isPending ? (
          <div className="flex items-center gap-2 px-2 py-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ) : session?.user ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full text-left">
              <div className="flex items-center gap-2 px-2 py-2">
                <UserAvatar
                  size="lg"
                  userId={session.session.userId}
                  name={session.user.name}
                />
                <div className="flex min-w-0 flex-1 flex-col text-left">
                  <span className="truncate text-sm font-medium">
                    {session.user.name}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {session.user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-68 md:w-54 ml-2" align="start">
              <DropdownMenuItem>
                <Settings className="size-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive">
                <LogOut className="size-4" />
                <span>Logout</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </SidebarFooter>
      {/* <SidebarRail /> */}
    </Sidebar>
  );
}
