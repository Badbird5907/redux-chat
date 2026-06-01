import { useSyncExternalStore } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { LogIn, LogOut, Settings, Shield, UserRoundX } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@redux/ui/components/button";
import { buttonVariants } from "@redux/ui/components/button-variants";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@redux/ui/components/sheet";
import { Skeleton } from "@redux/ui/components/skeleton";
import { useIsMobile } from "@redux/ui/hooks/use-mobile";
import { cn } from "@redux/ui/lib/utils";

import { UserInfo } from "@/components/user-info";
import { authClient } from "@/lib/auth/client";

function noopUnsubscribe() {
  // useSyncExternalStore requires returning an unsubscribe function.
}
const subscribeToClientSnapshot = () => noopUnsubscribe;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

async function stopImpersonating() {
  const res = await authClient.admin.stopImpersonating();
  if (res.error) {
    toast.error(res.error.message ?? "Failed to stop impersonating");
    return;
  }
  // The admin plugin switches the session cookie back to the admin's, but
  // does NOT refresh the convex_jwt cookie. Hitting /get-session while
  // authenticated triggers the after-hook that re-issues the JWT for the
  // restored session, so the reload authenticates as the admin again
  // instead of replaying the stale impersonated-user JWT.
  await authClient.getSession({ fetchOptions: { cache: "no-store" } });
  toast.success("Stopped impersonating");
  window.location.assign("/admin");
}

export const AppSidebarFooter = () => {
  const { data: session, isPending } = authClient.useSession();
  const isMobile = useIsMobile();
  const router = useRouter();
  const mounted = useSyncExternalStore(
    subscribeToClientSnapshot,
    getClientSnapshot,
    getServerSnapshot,
  );

  const handleSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          void router.navigate({ to: "/auth/sign-in", reloadDocument: true });
        },
      },
    });
  };

  const handleOpenSettings = () => {
    void router.navigate({ to: "/settings" });
  };

  if (!mounted || isPending) {
    return (
      <div className="flex items-center gap-2 p-2">
        <Skeleton className="size-10 rounded-full" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="p-2">
        <Link
          to="/auth/sign-in"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "w-full gap-2",
          )}
        >
          <LogIn className="size-4" />
          Sign in
        </Link>
      </div>
    );
  }
  const isImpersonating = Boolean(
    (session.session as { impersonatedBy?: string | null }).impersonatedBy,
  );
  const roles = ((session.user as { role?: string | null }).role ?? "user")
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role.length > 0);
  const isAdmin = roles.includes("admin");

  if (isMobile) {
    return (
      <Sheet>
        <SheetTrigger
          render={
            <button
              type="button"
              className="w-full text-left"
              aria-label="Open account settings"
            />
          }
        >
          <UserInfo
            userId={session.session.userId}
            name={session.user.name}
            email={session.user.email}
          />
        </SheetTrigger>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4">
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={handleOpenSettings}
                />
              }
            >
              <Settings className="size-4" />
              <span>Settings</span>
            </SheetClose>
            {isAdmin ? (
              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    render={<Link to="/admin" />}
                  />
                }
              >
                <Shield className="size-4" />
                <span>Admin</span>
              </SheetClose>
            ) : null}
            {isImpersonating ? (
              <Button
                variant="outline"
                className="w-full justify-start"
                onClick={stopImpersonating}
              >
                <UserRoundX className="size-4" />
                <span>Stop impersonating</span>
              </Button>
            ) : null}
            <Button
              variant="destructive"
              className="w-full justify-start"
              onClick={handleSignOut}
            >
              <LogOut className="size-4" />
              <span>Logout</span>
            </Button>
          </div>
          <SheetFooter />
        </SheetContent>
      </Sheet>
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
        <DropdownMenuItem onClick={handleOpenSettings}>
          <Settings className="size-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem render={<Link to="/admin" />}>
            <Shield className="size-4" />
            <span>Admin</span>
          </DropdownMenuItem>
        ) : null}
        {isImpersonating ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={stopImpersonating}>
              <UserRoundX className="size-4" />
              <span>Stop impersonating</span>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut className="size-4" />
          <span>Logout</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
