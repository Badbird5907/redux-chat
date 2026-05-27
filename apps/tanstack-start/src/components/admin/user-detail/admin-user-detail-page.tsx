import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@redux/backend/convex/_generated/api";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@redux/ui/components/card";
import { Skeleton } from "@redux/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@redux/ui/components/tabs";

import type { ActiveDialog, AdminUserDetail } from "./types";
import { AdminPageNav } from "@/components/admin/admin-page-nav";
import { authClient } from "@/lib/auth/client";
import { useQuery as useConvexQuery } from "@/lib/hooks/convex";
import { AdminUserAccountsTab } from "./accounts-tab";
import { AdminUserActivityTab } from "./activity-tab";
import { AdminUserCreditsTab } from "./credits-tab";
import { BanDialog } from "./dialogs/ban-dialog";
import { ChangePasswordDialog } from "./dialogs/change-password-dialog";
import { DeleteDialog } from "./dialogs/delete-dialog";
import { EditProfileDialog } from "./dialogs/edit-profile-dialog";
import { ImpersonateDialog } from "./dialogs/impersonate-dialog";
import { UnbanDialog } from "./dialogs/unban-dialog";
import { AdminUserOverviewTab } from "./overview-tab";
import { AdminUserSessionsTab } from "./sessions-tab";
import { AdminUserDetailHeader } from "./user-detail-header";

export function AdminUserDetailPage({ userId }: { userId: string }) {
  const [copied, setCopied] = useState(false);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const closeDialog = () => setActiveDialog(null);

  const userQuery = useQuery({
    queryKey: ["admin", "user", "get", userId],
    queryFn: async () => {
      const res = await authClient.admin.getUser({
        query: { id: userId },
      });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
  });

  const billingState = useConvexQuery(
    api.functions.adminUserDetail.getBillingStateForUser,
    { targetUserId: userId },
  );

  const user = userQuery.data as AdminUserDetail | undefined;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      console.info("[admin] copy user id failed");
    }
  };

  if (userQuery.isError) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <AdminPageNav
          items={[
            { label: "Admin", to: "/admin" },
            { label: "Users", to: "/admin/users" },
            { label: "Error" },
          ]}
        />
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Could not load user</CardTitle>
            <CardDescription>
              {userQuery.error instanceof Error
                ? userQuery.error.message
                : "Unknown error"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (userQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <AdminPageNav
          items={[
            { label: "Admin", to: "/admin" },
            { label: "Users", to: "/admin/users" },
            { label: "…" },
          ]}
        />
        <div className="border-border/60 bg-card/40 flex flex-wrap items-center gap-5 rounded-2xl border p-5">
          <Skeleton className="size-16 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-72" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (user == null) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <AdminPageNav
          items={[
            { label: "Admin", to: "/admin" },
            { label: "Users", to: "/admin/users" },
            { label: "Not found" },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>User not found</CardTitle>
            <CardDescription>
              No user exists with this ID, or the admin API could not return the
              record.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const trimmedName = user.name?.trim();
  const displayName =
    trimmedName !== undefined && trimmedName !== ""
      ? trimmedName
      : user.email.length > 0
        ? user.email
        : "Unknown user";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <AdminPageNav
        items={[
          { label: "Admin", to: "/admin" },
          { label: "Users", to: "/admin/users" },
          { label: displayName },
        ]}
      />

      <AdminUserDetailHeader
        user={user}
        displayName={displayName}
        copied={copied}
        billingState={billingState}
        onCopyId={copyId}
        onOpenDialog={(d) => setActiveDialog(d)}
      />

      <Tabs defaultValue="overview" className="gap-6" queryParam>
        <TabsList variant="line" className="self-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="credits">Credits</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="flex flex-col gap-6">
          <AdminUserOverviewTab user={user} />
        </TabsContent>

        <TabsContent value="accounts">
          <AdminUserAccountsTab targetUserId={userId} />
        </TabsContent>

        <TabsContent value="sessions">
          <AdminUserSessionsTab userId={userId} displayName={displayName} />
        </TabsContent>

        <TabsContent value="credits">
          <AdminUserCreditsTab
            userId={userId}
            displayName={displayName}
            billingState={billingState}
          />
        </TabsContent>

        <TabsContent value="activity">
          <AdminUserActivityTab userId={userId} displayName={displayName} />
        </TabsContent>
      </Tabs>

      <EditProfileDialog
        open={activeDialog === "profile"}
        onClose={closeDialog}
        userId={userId}
        displayName={displayName}
        user={user}
      />
      <ChangePasswordDialog
        open={activeDialog === "password"}
        onClose={closeDialog}
        userId={userId}
        displayName={displayName}
      />
      <ImpersonateDialog
        open={activeDialog === "impersonate"}
        onClose={closeDialog}
        userId={userId}
        displayName={displayName}
      />
      <BanDialog
        open={activeDialog === "ban"}
        onClose={closeDialog}
        userId={userId}
        displayName={displayName}
      />
      <UnbanDialog
        open={activeDialog === "unban"}
        onClose={closeDialog}
        userId={userId}
        displayName={displayName}
      />
      <DeleteDialog
        open={activeDialog === "delete"}
        onClose={closeDialog}
        userId={userId}
        displayName={displayName}
        confirmValue={user.email}
      />
    </div>
  );
}
