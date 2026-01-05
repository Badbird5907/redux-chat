"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@redux/ui/components/drawer";
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
  SidebarRail,
} from "@redux/ui/components/sidebar";
import { Button } from "@redux/ui/components/button";
import { Skeleton } from "@redux/ui/components/skeleton";
import { useIsMobile } from "@redux/ui/hooks/use-mobile";

import { authClient } from "@/auth/client";
import { UserInfo } from "@/components/user-info";

export default function AppSidebar({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, isPending } = authClient.useSession();
  const isMobile = useIsMobile();
  const router = useRouter();

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          router.push("/");
          router.refresh();
        },
      },
    });
  };
  return (
    <Sidebar className="border-none">
      <SidebarHeader className="pt-4">
        <Link href="/" className="self-center text-2xl font-bold" prefetch>
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
        {isPending ? (
          <div className="flex items-center gap-2 px-2 py-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ) : session?.user ? (
          isMobile ? (
            <Drawer>
              <DrawerTrigger className="w-full text-left">
                <UserInfo
                  userId={session.session.userId}
                  name={session.user.name}
                  email={session.user.email}
                />
              </DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>Settings</DrawerTitle>
                </DrawerHeader>
                <div className="flex flex-col gap-2 px-4">
                  <DrawerClose asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                    >
                      <Settings className="size-4" />
                      <span>Settings</span>
                    </Button>
                  </DrawerClose>
                  <Button
                    variant="destructive"
                    className="w-full justify-start"
                    onClick={handleSignOut}
                  >
                    <LogOut className="size-4" />
                    <span>Logout</span>
                  </Button>
                </div>
                <DrawerFooter />
              </DrawerContent>
            </Drawer>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full text-left">
                <UserInfo
                  userId={session.session.userId}
                  name={session.user.name}
                  email={session.user.email}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="ml-2 w-68 md:w-54" align="start">
                <DropdownMenuItem>
                  <Settings className="size-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        ) : null}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
