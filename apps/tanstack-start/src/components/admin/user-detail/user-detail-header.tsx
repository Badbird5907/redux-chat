import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  ShieldOff,
  Trash2,
  UserPen,
  UserRound,
} from "lucide-react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@redux/ui/components/avatar";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";

import type { UserBillingState } from "@redux/shared";

import type { ActiveDialog, AdminUserDetail } from "./types";

export function AdminUserDetailHeader({
  user,
  displayName,
  copied,
  onCopyId,
  onOpenDialog,
  billingState,
}: {
  user: AdminUserDetail;
  displayName: string;
  copied: boolean;
  onCopyId: () => void;
  onOpenDialog: (d: Exclude<ActiveDialog, null>) => void;
  billingState?: UserBillingState;
}) {
  const initials = displayName
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="border-border/60 bg-card/40 relative flex flex-wrap items-center gap-5 rounded-2xl border p-5">
      <Avatar className="size-16 rounded-xl">
        {user.image ? (
          <AvatarImage src={user.image} alt="" className="rounded-xl" />
        ) : null}
        <AvatarFallback className="rounded-xl text-lg">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-foreground text-xl font-semibold tracking-tight">
            {displayName}
          </h1>
          {user.banned ? (
            <Badge variant="destructive">Banned</Badge>
          ) : (
            <Badge
              variant="secondary"
              className="border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            >
              Active
            </Badge>
          )}
          {user.role ? (
            <Badge variant="outline" className="font-normal">
              {user.role}
            </Badge>
          ) : null}
          {user.emailVerified ? (
            <span className="text-muted-foreground/90 inline-flex items-center gap-1 text-xs">
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              Verified
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 truncate text-sm">
          {user.email}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onCopyId()}
            className="text-muted-foreground/80 hover:text-foreground mt-2 inline-flex max-w-full items-center gap-1.5 font-mono text-[11px] transition-colors"
            aria-label="Copy user ID"
          >
            <span className="truncate">{user.id}</span>
            {copied ? (
              <Check className="size-3 shrink-0 text-emerald-500" />
            ) : (
              <Copy className="size-3 shrink-0" />
            )}
          </button>
          {billingState?.url ? (
            <a
              href={billingState.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground/80 hover:text-foreground mt-1.5 inline-flex max-w-full items-center gap-1 text-xs underline-offset-4 hover:underline"
              aria-label="Open Polar customer (opens in a new tab)"
            >
              <span className="truncate">Polar customer</span>
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onOpenDialog("profile")}
        >
          <UserPen className="size-4" />
          Edit profile
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="More actions"
              />
            }
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onOpenDialog("password")}>
              <KeyRound className="size-4" />
              Change password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onOpenDialog("impersonate")}>
              <UserRound className="size-4" />
              Impersonate user
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {user.banned ? (
              <DropdownMenuItem onClick={() => onOpenDialog("unban")}>
                <ShieldOff className="size-4" />
                Unban user
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onOpenDialog("ban")}
              >
                <Ban className="size-4" />
                Ban user
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              variant="destructive"
              onClick={() => onOpenDialog("delete")}
            >
              <Trash2 className="size-4" />
              Delete user
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
