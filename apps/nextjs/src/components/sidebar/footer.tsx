"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";

import { Button } from "@redux/ui/components/button";
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
import { Skeleton } from "@redux/ui/components/skeleton";
import { useIsMobile } from "@redux/ui/hooks/use-mobile";

import { authClient } from "@/auth/client";
import { UserInfo } from "@/components/user-info";

export const AppSidebarFooter = () => {
  const { data: session, isPending } = authClient.useSession();
  const isMobile = useIsMobile();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line
    setMounted(true);
  }, []);

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

  if (!mounted || isPending || !session) {
    return (
      <div className="flex items-center gap-2 px-2 py-2">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }
  if (isMobile) {
    return (
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
              <Button variant="ghost" className="w-full justify-start" asChild>
                <Link href="/settings/general">
                  <Settings className="size-4" />
                  <span>Settings</span>
                </Link>
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
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full text-left">
        <UserInfo
          userId={session.session.userId}
          name={session.user.name}
          email={session.user.email}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="ml-2 w-68 md:w-54" align="start">
        <DropdownMenuItem asChild>
          <Link href="/settings/general" className="w-full flex items-center gap-2">
            <Settings className="size-4" />
            <span>Settings</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut className="size-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
