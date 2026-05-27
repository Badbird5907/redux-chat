import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  Dot,
  ExternalLink,
  KeyRound,
  MoreHorizontal,
  ShieldOff,
  Trash2,
  UserPen,
  UserRound,
} from "lucide-react";

import type { UserBillingState } from "@redux/shared";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";

import type { ActiveDialog, AdminUserDetail } from "./types";
import { formatDate } from "@/components/admin/user-detail/utils";

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
          {billingState?.tier && (
            <Badge
              variant="outline"
              className="font-normal"
              color={
                billingState.tier === "free"
                  ? undefined
                  : billingState.tier === "plus"
                    ? "orange"
                    : "critical"
              }
            >
              {billingState.tier.charAt(0).toUpperCase() +
                billingState.tier.slice(1)}
            </Badge>
          )}
          {user.banned && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="destructive">Banned</Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  User is banned for {user.banReason}{" "}
                  {user.banExpires && `until ${formatDate(user.banExpires)}`}
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          {user.role ? (
            <Badge variant="outline" className="font-normal">
              {user.role}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <p className="text-muted-foreground mt-1 truncate text-sm">
            {user.email}
          </p>
          {user.emailVerified ? (
            <Badge
              variant="secondary"
              color="green"
              // className="inline-flex items-center gap-1 border-emerald-500/20 bg-emerald-500/10 text-xs font-normal text-emerald-700 dark:text-emerald-400"
            >
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              Verified
            </Badge>
          ) : null}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onCopyId()}
            className="text-muted-foreground/80 hover:text-foreground inline-flex max-w-full items-center gap-1.5 font-mono text-[11px] transition-colors"
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
            <>
              <span className="text-muted-foreground/80 inline-flex shrink-0 items-center justify-center">
                <Dot className="size-3 shrink-0" aria-hidden />
              </span>
              <a
                href={billingState.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground/80 hover:text-foreground inline-flex max-w-full items-center gap-1 text-xs underline-offset-4 hover:underline"
                aria-label="Open Stripe customer (opens in a new tab)"
              >
                <span className="truncate">Stripe customer</span>
                <ExternalLink className="size-3 shrink-0" aria-hidden />
              </a>
            </>
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
