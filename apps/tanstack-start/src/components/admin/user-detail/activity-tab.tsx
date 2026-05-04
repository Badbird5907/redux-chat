"use no memo";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Flame,
  Info,
  Minus,
  XCircle,
} from "lucide-react";
import { usePaginatedQuery } from "convex/react";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Skeleton } from "@redux/ui/components/skeleton";

import { formatDate } from "./utils";

const PAGE_SIZE = 25;

type AuditEntry = {
  _id: string;
  action: string;
  status: string;
  severity: string;
  ipAddress?: string | null;
  createdAt: number;
};

function formatAction(raw: string): string {
  const socialMatch = /^sign-in:social:(.+)$/.exec(raw);
  if (socialMatch) {
    const provider = socialMatch[1] ?? "unknown";
    return `Sign In (${provider.charAt(0).toUpperCase()}${provider.slice(1)})`;
  }
  return raw
    .replace(/[_:-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function StatusBadge({ status }: { status: string }) {
  return status === "success" ? (
    <Badge
      variant="secondary"
      className="gap-1 border-emerald-500/20 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400"
    >
      <CheckCircle2 className="size-3" />
      Success
    </Badge>
  ) : (
    <Badge
      variant="secondary"
      className="gap-1 border-red-500/20 bg-red-500/10 font-normal text-red-700 dark:text-red-400"
    >
      <XCircle className="size-3" />
      Failed
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-red-500/35 font-normal text-red-700 dark:text-red-400"
        >
          <Flame className="size-3" />
          Critical
        </Badge>
      );
    case "high":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-orange-500/35 font-normal text-orange-700 dark:text-orange-400"
        >
          <AlertTriangle className="size-3" />
          High
        </Badge>
      );
    case "medium":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-yellow-500/35 font-normal text-yellow-700 dark:text-yellow-400"
        >
          <Info className="size-3" />
          Medium
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="gap-1 font-normal text-muted-foreground"
        >
          <Minus className="size-3" />
          Low
        </Badge>
      );
  }
}

export function AdminUserActivityTab({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.adminUserDetail.listAuditLogsForUser,
    { targetUserId: userId },
    { initialNumItems: PAGE_SIZE },
  );

  const entries = results as AuditEntry[];

  return (
    <section className="border-border/60 bg-card/40 rounded-2xl border">
      <div className="border-border/60 border-b px-5 py-4">
        <h2 className="text-foreground text-sm font-semibold">Activity</h2>
        <p className="text-muted-foreground text-xs">
          Auth events recorded for{" "}
          <span className="text-foreground font-medium">{displayName}</span>.
        </p>
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="space-y-2 px-5 py-5">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">
          No activity recorded for this user yet.
        </p>
      ) : (
        <>
          <ul className="divide-border/60 divide-y">
            {entries.map((entry) => (
              <li key={entry._id} className="px-5 py-3.5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-sm font-medium">
                      {formatAction(entry.action)}
                    </span>
                    <StatusBadge status={entry.status} />
                    <SeverityBadge severity={entry.severity} />
                  </div>
                  <dl className="text-muted-foreground flex flex-wrap gap-x-6 text-xs">
                    <div>
                      <dt className="sr-only">Time</dt>
                      <dd>{formatDate(entry.createdAt)}</dd>
                    </div>
                    {entry.ipAddress ? (
                      <div>
                        <dt className="sr-only">IP</dt>
                        <dd className="font-mono">{entry.ipAddress}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </li>
            ))}
          </ul>
          {status === "CanLoadMore" ? (
            <div className="border-border/60 border-t px-5 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full"
                onClick={() => loadMore(PAGE_SIZE)}
              >
                <ChevronDown className="size-4" />
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
