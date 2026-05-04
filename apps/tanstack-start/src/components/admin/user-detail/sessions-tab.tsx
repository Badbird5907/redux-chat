"use no memo";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { Skeleton } from "@redux/ui/components/skeleton";

import { authClient } from "@/lib/auth/client";

import { formatDate } from "./utils";

/** Shape returned by the admin plug-in (`parseSessionOutput`) — tolerant for JSON deserialization. */
type ListedSessionRow = {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date | string | number;
  createdAt?: Date | string | number | null;
  updatedAt?: Date | string | number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  impersonatedBy?: string | null;
};

function sessionExpiresMs(ts: ListedSessionRow["expiresAt"]): number {
  if (typeof ts === "number") {
    return ts > 10_000_000_000 ? ts : ts * 1000;
  }
  if (ts instanceof Date) {
    return ts.getTime();
  }
  return new Date(ts).getTime();
}

function isExpired(expiresAt: ListedSessionRow["expiresAt"]) {
  return sessionExpiresMs(expiresAt) <= Date.now();
}

function shortenUserAgent(ua: string | null | undefined) {
  if (ua == null || ua.trim() === "") {
    return null;
  }
  const trimmed = ua.trim();
  return trimmed.length > 96 ? `${trimmed.slice(0, 93)}…` : trimmed;
}

function sessionFingerprint(token: string) {
  if (token.length <= 16) {
    return "••••";
  }
  return `${token.slice(0, 4)}···${token.slice(-6)}`;
}

function sortSessions(list: ListedSessionRow[]) {
  return [...list].sort((a, b) => {
    const ea = isExpired(a.expiresAt);
    const eb = isExpired(b.expiresAt);
    if (ea !== eb) {
      return ea ? 1 : -1;
    }
    return sessionExpiresMs(b.expiresAt) - sessionExpiresMs(a.expiresAt);
  });
}

function SessionRows({
  userId,
  sessions,
}: {
  userId: string;
  sessions: ListedSessionRow[];
}) {
  const queryClient = useQueryClient();

  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

  const revokeSession = useMutation({
    mutationFn: async (sessionToken: string) => {
      const res = await authClient.admin.revokeUserSession({ sessionToken });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    onSuccess: async () => {
      toast.success("Session revoked");
      await queryClient.invalidateQueries({
        queryKey: ["admin", "user", "sessions", userId],
      });
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    },
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      const res = await authClient.admin.revokeUserSessions({ userId });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    onSuccess: async () => {
      toast.success("All sessions revoked for this user");
      setRevokeAllOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ["admin", "user", "sessions", userId],
      });
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke sessions",
      );
    },
  });

  const ordered = useMemo(() => sortSessions(sessions), [sessions]);

  const activeCount = ordered.filter((s) => !isExpired(s.expiresAt)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-1">
        <p className="text-muted-foreground text-xs">
          {sessions.length === 0
            ? "No recorded sessions."
            : `${sessions.length} session row${sessions.length === 1 ? "" : "s"} · ${activeCount} not expired`}
        </p>
        {sessions.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              revokeSession.isPending ||
              revokeAll.isPending ||
              ordered.length === 0
            }
            className="text-destructive border-destructive/40 hover:bg-destructive/10"
            onClick={() => setRevokeAllOpen(true)}
          >
            Revoke all
          </Button>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground px-5 pb-6 text-sm">
          This user has no saved sessions yet.
        </p>
      ) : (
        <ul className="divide-border/60 divide-y">
          {ordered.map((s) => {
            const expired = isExpired(s.expiresAt);
            const uaShort = shortenUserAgent(s.userAgent);
            const revoking =
              revokeSession.isPending && revokeSession.variables === s.token;

            return (
              <li key={s.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Laptop className="text-muted-foreground size-4 shrink-0" />
                      <span className="text-foreground font-mono text-xs">
                        Session {sessionFingerprint(s.token)}
                      </span>
                      {expired ? (
                        <Badge variant="outline" className="font-normal">
                          Expired
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="border-emerald-500/20 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400"
                        >
                          Active
                        </Badge>
                      )}
                      {s.impersonatedBy ? (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/35 font-normal text-amber-800 dark:text-amber-400"
                        >
                          <ShieldAlert className="size-3" />
                          Impersonation session
                        </Badge>
                      ) : null}
                    </div>
                    <dl className="text-muted-foreground grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
                      <div>
                        <dt className="text-[11px] font-medium uppercase">
                          Expires
                        </dt>
                        <dd>{formatDate(s.expiresAt)}</dd>
                      </div>
                      {s.updatedAt ? (
                        <div>
                          <dt className="text-[11px] font-medium uppercase">
                            Updated
                          </dt>
                          <dd>{formatDate(s.updatedAt)}</dd>
                        </div>
                      ) : null}
                      {s.ipAddress ? (
                        <div className="sm:col-span-2">
                          <dt className="text-[11px] font-medium uppercase">
                            IP
                          </dt>
                          <dd className="font-mono">{s.ipAddress}</dd>
                        </div>
                      ) : null}
                      {uaShort ? (
                        <div className="sm:col-span-2">
                          <dt className="text-[11px] font-medium uppercase">
                            User agent
                          </dt>
                          <dd className="break-words">{uaShort}</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                  <div className="flex shrink-0 items-start">
                    {expired ? null : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/40 hover:bg-destructive/10 shrink-0"
                        disabled={
                          revokeSession.isPending || revokeAll.isPending
                        }
                        onClick={() => revokeSession.mutate(s.token)}
                      >
                        {revoking ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          "Revoke"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke every session?</DialogTitle>
            <DialogDescription className="flex items-start gap-2">
              <TriangleAlert className="text-muted-foreground mt-0.5 size-4 shrink-0" />
              <span>
                This signs the user out everywhere (including impersonation and
                device sessions). Continue?
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevokeAllOpen(false)}
              disabled={revokeAll.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={revokeAll.isPending}
              onClick={() => revokeAll.mutate()}
            >
              {revokeAll.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Revoke all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminUserSessionsTab({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const sessionsQuery = useQuery({
    queryKey: ["admin", "user", "sessions", userId],
    queryFn: async () => {
      const res = await authClient.admin.listUserSessions({ userId });
      if (res.error) {
        throw new Error(res.error.message);
      }
      const payload = res.data as { sessions?: ListedSessionRow[] } | undefined;
      return payload?.sessions ?? [];
    },
  });

  return (
    <section className="border-border/60 bg-card/40 rounded-2xl border">
      <div className="border-border/60 border-b px-5 py-4">
        <h2 className="text-foreground text-sm font-semibold">Sessions</h2>
        <p className="text-muted-foreground text-xs">
          Browser and device cookies for{" "}
          <span className="text-foreground font-medium">{displayName}</span>.
          Revoking ends those sign-ins immediately.
        </p>
      </div>
      {sessionsQuery.isPending ? (
        <div className="space-y-2 px-5 py-5">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : sessionsQuery.isError ? (
        <p className="text-destructive px-5 py-6 text-sm">
          {sessionsQuery.error instanceof Error
            ? sessionsQuery.error.message
            : "Could not load sessions"}
        </p>
      ) : (
        <SessionRows userId={userId} sessions={sessionsQuery.data} />
      )}
    </section>
  );
}
