"use no memo";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link2Off, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Skeleton } from "@redux/ui/components/skeleton";

import { formatDate } from "./utils";

type LinkedAuthAccountDTO = {
  providerId: string;
  externalAccountId: string;
  createdAt: number;
  updatedAt: number;
  scope: string | null;
  hasCredentialPassword: boolean;
};

function providerLabel(providerId: string): string {
  switch (providerId.toLowerCase()) {
    case "credential":
      return "Email & password";
    case "github":
      return "GitHub";
    case "google":
      return "Google";
    default:
      return providerId;
  }
}

function accountRowKey(a: LinkedAuthAccountDTO) {
  return `${a.providerId}:${a.externalAccountId}`;
}

function AccountRows({
  accounts,
  targetUserId,
}: {
  accounts: LinkedAuthAccountDTO[];
  targetUserId: string;
}) {
  const unlinkAccount = useMutation(
    api.functions.adminUserDetail.unlinkLinkedAccountForUser,
  );
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const onlyAccount = accounts.length <= 1;

  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground px-5 py-6 text-sm">
        No linked sign-in providers found for this user.
      </p>
    );
  }

  const onUnlink = async (a: LinkedAuthAccountDTO) => {
    if (onlyAccount) {
      return;
    }
    const confirmed = window.confirm(
      `Unlink ${providerLabel(a.providerId)} from this user? They must still have another way to sign in.`,
    );
    if (!confirmed) {
      return;
    }
    const key = accountRowKey(a);
    setBusyKey(key);
    try {
      await unlinkAccount({
        targetUserId,
        providerId: a.providerId,
        externalAccountId: a.externalAccountId,
      });
      toast.success(`Unlinked ${providerLabel(a.providerId)}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to unlink account",
      );
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <ul className="divide-border/60 divide-y">
      {accounts.map((a) => {
        const key = accountRowKey(a);
        const busy = busyKey === key;

        return (
          <li key={key} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-foreground text-sm font-semibold">
                    {providerLabel(a.providerId)}
                  </p>
                  <Badge variant="outline" className="font-normal">
                    {a.providerId}
                  </Badge>
                  {a.hasCredentialPassword ? (
                    <Badge
                      variant="secondary"
                      className="border-border/70 font-normal"
                    >
                      Password set
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground font-mono text-xs break-all">
                  {a.providerId === "credential"
                    ? "Credential record (linked to this Better Auth user)"
                    : `Provider subject ID · ${a.externalAccountId}`}
                </p>
                {a.scope ? (
                  <p className="text-muted-foreground/90 line-clamp-2 text-[11px] break-all">
                    Scope: {a.scope}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <div className="text-muted-foreground text-right text-xs">
                  <p>Linked {formatDate(a.createdAt)}</p>
                  {a.updatedAt !== a.createdAt ? (
                    <p className="mt-0.5">Updated {formatDate(a.updatedAt)}</p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:bg-destructive/10 border-destructive/40 gap-1.5"
                  disabled={onlyAccount || busyKey !== null}
                  title={
                    onlyAccount
                      ? "User must keep at least one sign-in method"
                      : undefined
                  }
                  onClick={() => void onUnlink(a)}
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Link2Off className="size-4" />
                  )}
                  Unlink
                </Button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function AdminUserAccountsTab({
  targetUserId,
}: {
  targetUserId: string;
}) {
  const accounts = useQuery(
    api.functions.adminUserDetail.listLinkedAccountsForUser,
    { targetUserId },
  );

  return (
    <section className="border-border/60 bg-card/40 rounded-2xl border">
      <div className="border-border/60 border-b px-5 py-4">
        <h2 className="text-foreground text-sm font-semibold">Accounts</h2>
        <p className="text-muted-foreground text-xs">
          OAuth providers and credential rows from Better Auth. Sensitive tokens
          are never returned.
        </p>
      </div>
      {accounts === undefined ? (
        <div className="space-y-2 px-5 py-5">
          <Skeleton className="h-14 w-full rounded-lg" />
          <Skeleton className="h-14 w-full rounded-lg" />
        </div>
      ) : (
        <AccountRows accounts={accounts} targetUserId={targetUserId} />
      )}
    </section>
  );
}
