import { useQuery } from "convex/react";

import { api } from "@redux/backend/convex/_generated/api";
import { Skeleton } from "@redux/ui/components/skeleton";

import type { AdminUserDetail } from "./types";
import type { UsageStats } from "./utils";
import { InfoField } from "./info-field";
import { StatCard } from "./stat-card";
import { formatDate } from "./utils";

export function AdminUserOverviewTab({ user }: { user: AdminUserDetail }) {
  const stats = useQuery(api.functions.adminUserDetail.getUsageStatsForUser, {
    targetUserId: user.id,
  });

  return (
    <>
      <section className="border-border/60 bg-card/40 rounded-2xl border">
        <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <div>
            <h2 className="text-foreground text-sm font-semibold">Profile</h2>
            <p className="text-muted-foreground text-xs">
              Basic details and account status.
            </p>
          </div>
        </div>
        <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
          <InfoField label="Name">
            {typeof user.name === "string" && user.name.trim() !== ""
              ? user.name
              : "—"}
          </InfoField>
          <InfoField label="Email">
            <span className="break-all">{user.email}</span>
          </InfoField>
          <InfoField label="Joined">{formatDate(user.createdAt)}</InfoField>
          <InfoField label="Last updated">
            {formatDate(user.updatedAt)}
          </InfoField>
          <InfoField label="Role">
            <span className="text-muted-foreground">{user.role ?? "—"}</span>
          </InfoField>
          <InfoField label="Email verified">
            {user.emailVerified ? "Yes" : "No"}
          </InfoField>
          {user.banned ? (
            <>
              <InfoField label="Ban reason" className="sm:col-span-2">
                {user.banReason ?? "—"}
              </InfoField>
              <InfoField label="Ban expires">
                {formatDate(user.banExpires)}
              </InfoField>
            </>
          ) : null}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-foreground text-sm font-semibold">Usage</h2>
          <span className="text-muted-foreground text-xs">
            {stats === undefined ? "Loading usage..." : "Live usage data"}
          </span>
        </div>
        {stats === undefined ? (
          <UsageStatsSkeleton />
        ) : (
          <UsageStatsGrid stats={stats} />
        )}
      </section>
    </>
  );
}

function UsageStatsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div
          key={index}
          className="border-border/60 bg-card/40 rounded-xl border px-4 py-3"
        >
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-2 h-7 w-20" />
          <Skeleton className="mt-1 h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

function UsageStatsGrid({ stats }: { stats: UsageStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        label="Chat messages"
        value={stats.totalMessages.toLocaleString()}
        hint="All time"
      />
      <StatCard
        label="Threads created"
        value={stats.threadsCreated.toLocaleString()}
      />
      <StatCard
        label="Attachments uploaded"
        value={stats.attachmentsUploaded.toLocaleString()}
      />
      <StatCard
        label="Storage"
        value={formatStorage(stats.storageBytes)}
        hint="Silo / attachments"
      />
      <StatCard
        label="Chat API calls"
        value={stats.chatApiCalls30d.toLocaleString()}
        hint="Last 30 days"
      />
      <StatCard
        label="Last active"
        value={formatLastActiveLabel(stats.lastActiveAt)}
      />
    </div>
  );
}

function formatStorage(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function formatLastActiveLabel(lastActiveAt: number | null): string {
  if (lastActiveAt === null) {
    return "Never";
  }

  const msAgo = Date.now() - lastActiveAt;
  const dayMs = 24 * 60 * 60 * 1000;

  if (msAgo < dayMs) {
    return "Today";
  }
  if (msAgo < 7 * dayMs) {
    return "This week";
  }

  return formatDate(lastActiveAt);
}
