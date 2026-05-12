import type { ElementType } from "react";
import { usePaginatedQuery } from "convex/react";
import { ChevronDown, Gift, RefreshCw, ShoppingBag } from "lucide-react";

import type { CreditBucket } from "@redux/shared";
import { api } from "@redux/backend/convex/_generated/api";
import { CREDIT_BUCKETS } from "@redux/shared";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@redux/ui/components/dialog";
import { Skeleton } from "@redux/ui/components/skeleton";

import { formatNumber } from "@/components/billing/credit-balance-panel";

const PAGE_SIZE = 10;

const BUCKET_ICONS: Record<CreditBucket, ElementType> = {
  gifted: Gift,
  monthly: RefreshCw,
  paid: ShoppingBag,
};

const STATUS_STYLES: Record<string, string> = {
  active:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  exhausted:
    "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  expired: "border-zinc-500/20 bg-zinc-500/10 text-zinc-500",
  revoked: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
};

type Grant = {
  _id: string;
  grantId: string;
  bucket: CreditBucket;
  amount: number;
  remaining: number;
  status: string;
  source: string;
  periodKey?: string;
  expiresAt?: number;
  grantedAt: number;
};

function formatDate(value: number | undefined): string {
  if (value === undefined) {
    return "Never";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatSource(source: string): string {
  switch (source) {
    case "polar_subscription_renewal":
      return "Subscription renewal";
    case "polar_one_time_purchase":
      return "One-time purchase";
    case "free_monthly_reset":
      return "Free monthly allowance";
    case "admin_grant":
      return "Account credit";
    case "migration_backfill":
      return "Migration backfill";
    default:
      return source;
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function BucketBadge({ bucket }: { bucket: CreditBucket }) {
  const Icon = BUCKET_ICONS[bucket];

  return (
    <Badge variant="secondary" className="gap-1 font-normal">
      <Icon className="size-3.5" aria-hidden />
      {CREDIT_BUCKETS[bucket].label}
    </Badge>
  );
}

function GrantRow({ grant }: { grant: Grant }) {
  const statusStyle = STATUS_STYLES[grant.status] ?? STATUS_STYLES.expired;

  return (
    <li className="px-5 py-3.5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <BucketBadge bucket={grant.bucket} />
            <Badge variant="secondary" className={`font-normal ${statusStyle}`}>
              {statusLabel(grant.status)}
            </Badge>
            <span className="text-muted-foreground text-xs">
              {formatSource(grant.source)}
            </span>
          </div>
          <dl className="text-muted-foreground flex flex-wrap gap-x-5 gap-y-1 text-xs">
            <div>
              <dt className="sr-only">Granted</dt>
              <dd>Granted {formatDate(grant.grantedAt)}</dd>
            </div>
            <div>
              <dt className="sr-only">Expires</dt>
              <dd>Expires {formatDate(grant.expiresAt)}</dd>
            </div>
            {grant.periodKey ? (
              <div>
                <dt className="sr-only">Period</dt>
                <dd>Period {grant.periodKey}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="shrink-0 text-left sm:text-right">
          <p className="text-foreground text-sm font-semibold tabular-nums">
            {formatNumber(grant.remaining)}
            <span className="text-muted-foreground font-normal">
              {" / "}
              {formatNumber(grant.amount)}
            </span>
          </p>
          <p className="text-muted-foreground text-[11px]">remaining / total</p>
        </div>
      </div>
    </li>
  );
}

function CreditGrantHistoryList() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.credits.listCreditGrants,
    {},
    { initialNumItems: PAGE_SIZE },
  );
  const grants = results as Grant[];

  return (
    <div className="border-border/60 overflow-hidden rounded-lg border">
      {status === "LoadingFirstPage" ? (
        <div className="space-y-2 px-5 py-5">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : grants.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">
          No credit grants found.
        </p>
      ) : (
        <>
          <ul className="divide-border/60 max-h-[60vh] divide-y overflow-y-auto">
            {grants.map((grant) => (
              <GrantRow key={grant._id} grant={grant} />
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
                <ChevronDown className="size-4" aria-hidden />
                Load more
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function CreditGrantHistoryDialog() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground h-8 px-2 text-xs"
          />
        }
      >
        View grants
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Credit grants</DialogTitle>
          <DialogDescription>
            Current and past grants
          </DialogDescription>
        </DialogHeader>
        <CreditGrantHistoryList />
      </DialogContent>
    </Dialog>
  );
}
