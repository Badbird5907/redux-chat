import { Link, useParams } from "@tanstack/react-router";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { Ban, Copy, Pause, Play, Search } from "lucide-react";
import { toast } from "sonner";

import type { PromotionRedemptionStatus } from "@redux/shared";
import type { ColumnDef } from "@redux/ui/components/data-table";
import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { DataTable } from "@redux/ui/components/data-table";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";

import { AdminPageNav } from "@/components/admin/admin-page-nav";
import { PromotionFormDialog } from "@/components/admin/promotion-form-dialog";
import { formatDate } from "@/components/admin/user-detail/utils";
import { useReducerState } from "@/lib/hooks/use-reducer-state";

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const ALL_STATUSES = "all";

type StatusFilter = PromotionRedemptionStatus | typeof ALL_STATUSES;

function isStatusFilter(value: string | null): value is StatusFilter {
  return (
    value === ALL_STATUSES ||
    value === "reserved" ||
    value === "pending_checkout" ||
    value === "applied" ||
    value === "failed" ||
    value === "revoked"
  );
}

function redemptionStatusBadgeColor(status: PromotionRedemptionStatus) {
  switch (status) {
    case "applied":
      return "green" as const;
    case "failed":
      return "red" as const;
    case "revoked":
      return "muted" as const;
    case "reserved":
      return "yellow" as const;
    case "pending_checkout":
      return "orange" as const;
  }
}

type RedemptionStripeFields = {
  appCreditGrantId?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeCouponId?: string;
  stripeCheckoutSessionId?: string;
  stripeCheckoutSessionExpiresAt?: number;
  stripeCustomerBalanceTransactionId?: string;
  stripeCreditGrantId?: string;
  metadata?: unknown;
};

type PromotionRedemptionRow = RedemptionStripeFields & {
  redemptionId: string;
  userId: string;
  userEmail?: string | null;
  isRepeatUser?: boolean;
  status: PromotionRedemptionStatus;
  reservedAt?: number;
  appliedAt?: number;
  targetTier?: string | null;
  kind: string;
  failureReason?: string;
};

export function StripeIds({
  redemption,
}: {
  redemption: RedemptionStripeFields;
}) {
  const reversalTransactionId = metadataString(
    redemption.metadata,
    "reversalTransactionId",
  );
  const rows = [
    ["grant", redemption.appCreditGrantId],
    ["customer", redemption.stripeCustomerId],
    ["subscription", redemption.stripeSubscriptionId],
    ["coupon", redemption.stripeCouponId],
    ["checkout", redemption.stripeCheckoutSessionId],
    ["balance tx", redemption.stripeCustomerBalanceTransactionId],
    ["reversal", reversalTransactionId],
    ["legacy credit", redemption.stripeCreditGrantId],
  ].filter((row): row is [string, string] => typeof row[1] === "string");

  if (rows.length === 0) return <>None</>;

  return (
    <div className="grid gap-1">
      {rows.map(([label, value]) => (
        <div key={`${label}:${value}`} className="truncate">
          <span className="text-muted-foreground">{label}: </span>
          {value}
        </div>
      ))}
      {redemption.stripeCheckoutSessionExpiresAt ? (
        <div className="text-muted-foreground truncate">
          checkout expires:{" "}
          {formatDate(redemption.stripeCheckoutSessionExpiresAt)}
        </div>
      ) : null}
    </div>
  );
}

function metadataString(metadata: unknown, key: string): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

export function AdminPromotionDetailPage() {
  const { promotionId } = useParams({ from: "/admin/promotions/$promotionId" });
  const [statusFilter, setStatusFilter] =
    useReducerState<StatusFilter>(ALL_STATUSES);
  const [userSearchInput, setUserSearchInput] = useReducerState("");
  const [activeUserSearch, setActiveUserSearch] = useReducerState("");
  const [fromInput, setFromInput] = useReducerState("");
  const [toInput, setToInput] = useReducerState("");
  const [repeatedOnly, setRepeatedOnly] = useReducerState(false);
  const [page, setPage] = useReducerState(1);
  const [pageSize, setPageSize] = useReducerState(PAGE_SIZE);

  const detail = useQuery(api.functions.promotions.adminGetPromotion, {
    promotionId,
  });
  const pausePromotion = useMutation(
    api.functions.promotions.adminPausePromotion,
  );
  const resumePromotion = useMutation(
    api.functions.promotions.adminResumePromotion,
  );
  const archivePromotion = useMutation(
    api.functions.promotions.adminArchivePromotion,
  );
  const revokeGrant = useMutation(
    api.functions.promotions.adminRevokePromotionAppCreditGrant,
  );
  const revokeInvoiceCredit = useAction(
    api.functions.promotions.adminRevokePromotionStripeInvoiceCredit,
  );

  const from = fromInput ? Date.parse(fromInput) : undefined;
  const to = toInput ? Date.parse(toInput) : undefined;

  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.promotions.adminListPromotionRedemptions,
    {
      promotionId,
      status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
      targetUserId: activeUserSearch || undefined,
      from: Number.isFinite(from) ? from : undefined,
      to: Number.isFinite(to) ? to : undefined,
      repeatedUsersOnly: repeatedOnly || undefined,
    },
    { initialNumItems: pageSize },
  );

  const redemptions = results as PromotionRedemptionRow[];
  const loadedPages = Math.max(1, Math.ceil(redemptions.length / pageSize));
  const hasNextPage =
    page < loadedPages || (page === loadedPages && status === "CanLoadMore");
  const pagedRedemptions = redemptions.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const resetPagination = () => {
    setPage(1);
  };

  const pause = async () => {
    try {
      await pausePromotion({ promotionId });
      toast.success("Promotion paused");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pause failed");
    }
  };

  const resume = async () => {
    try {
      await resumePromotion({ promotionId });
      toast.success("Promotion resumed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Resume failed");
    }
  };

  const archive = async () => {
    try {
      await archivePromotion({ promotionId });
      toast.success("Promotion archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Archive failed");
    }
  };

  const revoke = async (redemptionId: string) => {
    try {
      await revokeGrant({ redemptionId });
      toast.success("Promotion grant revoked");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revoke failed");
    }
  };

  const revokeStripeInvoiceCredit = async (redemptionId: string) => {
    try {
      await revokeInvoiceCredit({ redemptionId });
      toast.success("Invoice credit reversed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revoke failed");
    }
  };

  const columns: ColumnDef<PromotionRedemptionRow>[] = [
    {
      accessorKey: "userId",
      header: "User",
      cell: ({ row }) => {
        const redemption = row.original;
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Link
              to="/admin/users/$userId"
              params={{ userId: redemption.userId }}
              className="text-primary truncate text-sm font-medium underline-offset-4 hover:underline"
            >
              {redemption.userEmail ?? redemption.userId}
            </Link>
            {redemption.isRepeatUser ? (
              <Badge variant="secondary" className="shrink-0">
                repeat
              </Badge>
            ) : null}
          </div>
        );
      },
      meta: { cellClassName: "max-w-[280px] min-w-0" },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <Badge
          variant="secondary"
          color={redemptionStatusBadgeColor(row.original.status)}
        >
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "reservedAt",
      header: "Reserved",
      cell: ({ row }) => formatDate(row.original.reservedAt),
      meta: { cellClassName: "text-xs" },
    },
    {
      accessorKey: "appliedAt",
      header: "Applied",
      cell: ({ row }) => formatDate(row.original.appliedAt),
      meta: { cellClassName: "text-xs" },
    },
    {
      accessorKey: "targetTier",
      header: "Tier",
      cell: ({ row }) => row.original.targetTier ?? "—",
      meta: { cellClassName: "text-xs" },
    },
    {
      accessorKey: "kind",
      header: "Benefit",
    },
    {
      id: "stripeIds",
      header: "Stripe IDs",
      cell: ({ row }) => <StripeIds redemption={row.original} />,
      meta: { cellClassName: "max-w-[280px] font-mono text-xs" },
    },
    {
      accessorKey: "failureReason",
      header: "Failure",
      cell: ({ row }) => row.original.failureReason ?? "—",
      meta: { cellClassName: "max-w-[240px] truncate text-xs" },
    },
    {
      id: "action",
      header: () => <div className="text-right">Action</div>,
      cell: ({ row }) => {
        const redemption = row.original;
        return (
          <div className="text-right">
            {redemption.status === "applied" && redemption.appCreditGrantId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void revoke(redemption.redemptionId)}
              >
                Revoke
              </Button>
            ) : redemption.status === "applied" &&
              redemption.stripeCustomerBalanceTransactionId ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void revokeStripeInvoiceCredit(redemption.redemptionId)
                }
              >
                Revoke
              </Button>
            ) : null}
          </div>
        );
      },
      meta: { headerClassName: "text-right", cellClassName: "text-right" },
    },
  ];

  const handlePageChange = (nextPage: number) => {
    let safeNextPage = Math.max(1, nextPage);
    if (safeNextPage > loadedPages) {
      if (status === "CanLoadMore") {
        loadMore(pageSize);
      } else {
        safeNextPage = loadedPages;
      }
    }
    setPage(safeNextPage);
  };

  if (detail === undefined) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <AdminPageNav
          items={[
            { label: "Admin", to: "/admin" },
            { label: "Promotions", to: "/admin/promotions" },
            { label: "…" },
          ]}
        />
        <p className="text-muted-foreground text-sm">Loading promotion…</p>
      </div>
    );
  }

  const { promotion, usageSummary } = detail;
  const remaining =
    promotion.maxRedemptions === undefined
      ? "Unlimited"
      : Math.max(0, promotion.maxRedemptions - promotion.redeemedCount);
  const redeemUrl =
    typeof window === "undefined"
      ? `/redeem/${promotion.code}`
      : `${window.location.origin}/redeem/${promotion.code}`;

  const copyRedeemUrl = async () => {
    await navigator.clipboard.writeText(redeemUrl);
    toast.success("Redeem URL copied");
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4">
        <AdminPageNav
          items={[
            { label: "Admin", to: "/admin" },
            { label: "Promotions", to: "/admin/promotions" },
            { label: promotion.name },
          ]}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-foreground min-w-0 text-3xl font-semibold tracking-tight">
                {promotion.name}
              </h1>
              <Badge
                variant="secondary"
                color={
                  promotion.status === "active"
                    ? "green"
                    : promotion.status === "paused"
                      ? "yellow"
                      : "red"
                }
              >
                {promotion.status}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-2 font-mono text-sm">
              {promotion.code}
            </p>
            {promotion.description ? (
              <p className="text-muted-foreground mt-2 text-sm">
                {promotion.description}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={copyRedeemUrl}>
              <Copy className="size-4" />
              Copy URL
            </Button>
            <PromotionFormDialog mode="edit" promotion={promotion} />
            {promotion.status === "active" ? (
              <Button
                type="button"
                variant="outline"
                className="border-amber-500/35 bg-amber-500/10 text-amber-900 hover:bg-amber-500/15 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20"
                onClick={() => void pause()}
              >
                <Pause className="size-4" />
                Pause
              </Button>
            ) : null}
            {promotion.status === "paused" ? (
              <Button
                type="button"
                variant="outline"
                className="border-emerald-500/35 bg-emerald-500/10 text-emerald-900 hover:bg-emerald-500/15 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20"
                onClick={() => void resume()}
              >
                <Play className="size-4" />
                Resume
              </Button>
            ) : null}
            <Button
              type="button"
              variant="destructive"
              disabled={promotion.status === "archived"}
              onClick={() => void archive()}
            >
              <Ban className="size-4" />
              Archive
            </Button>
          </div>
        </div>
      </div>

      <div className="border-border/70 bg-card/60 rounded-xl border px-4 py-3">
        <dl className="grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Applied</dt>
            <dd className="text-foreground mt-0.5 text-base font-semibold tabular-nums">
              {usageSummary.appliedCount.toLocaleString()}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Reserved</dt>
            <dd className="text-foreground mt-0.5 text-base font-semibold tabular-nums">
              {usageSummary.reservedCount.toLocaleString()}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Failed</dt>
            <dd className="text-foreground mt-0.5 text-base font-semibold tabular-nums">
              {usageSummary.failedCount.toLocaleString()}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Revoked</dt>
            <dd className="text-foreground mt-0.5 text-base font-semibold tabular-nums">
              {usageSummary.revokedCount.toLocaleString()}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Unique users</dt>
            <dd className="text-foreground mt-0.5 text-base font-semibold tabular-nums">
              {usageSummary.uniqueUserCount.toLocaleString()}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Repeat users</dt>
            <dd className="text-foreground mt-0.5 text-base font-semibold tabular-nums">
              {usageSummary.repeatUserCount.toLocaleString()}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Remaining</dt>
            <dd className="text-foreground mt-0.5 text-base font-semibold tabular-nums">
              {typeof remaining === "number"
                ? remaining.toLocaleString()
                : remaining}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground text-xs">Per user</dt>
            <dd className="text-foreground mt-0.5 text-sm leading-snug font-semibold">
              {promotion.perUserRedemptionLabel}
            </dd>
          </div>
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-[160px_1fr_180px_180px_auto_auto] lg:gap-3">
        <div className="grid min-w-0 gap-1 lg:gap-2">
          <Label className="text-muted-foreground text-xs lg:text-sm">
            Status
          </Label>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (isStatusFilter(value)) {
                resetPagination();
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger className="w-full min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All</SelectItem>
              <SelectItem value="reserved">Reserved</SelectItem>
              <SelectItem value="pending_checkout">Pending checkout</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="revoked">Revoked</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid min-w-0 gap-1 lg:gap-2">
          <Label
            className="text-muted-foreground text-xs lg:text-sm"
            htmlFor="promotion-user-filter"
          >
            User
          </Label>
          <Input
            id="promotion-user-filter"
            className="min-w-0"
            value={userSearchInput}
            onChange={(e) => setUserSearchInput(e.target.value)}
            placeholder="Filter by user id"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                resetPagination();
                setActiveUserSearch(userSearchInput.trim());
              }
            }}
          />
        </div>
        <div className="grid min-w-0 gap-1 lg:gap-2">
          <Label
            className="text-muted-foreground text-xs lg:text-sm"
            htmlFor="promotion-from"
          >
            From
          </Label>
          <Input
            id="promotion-from"
            type="date"
            value={fromInput}
            onChange={(e) => {
              resetPagination();
              setFromInput(e.target.value);
            }}
          />
        </div>
        <div className="grid min-w-0 gap-1 lg:gap-2">
          <Label
            className="text-muted-foreground text-xs lg:text-sm"
            htmlFor="promotion-to"
          >
            To
          </Label>
          <Input
            id="promotion-to"
            type="date"
            value={toInput}
            onChange={(e) => {
              resetPagination();
              setToInput(e.target.value);
            }}
          />
        </div>
        <Button
          type="button"
          variant={repeatedOnly ? "default" : "outline"}
          className="h-9 justify-center self-end text-xs lg:h-10 lg:text-sm"
          onClick={() => {
            resetPagination();
            setRepeatedOnly((value) => !value);
          }}
        >
          Repeat users
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="h-9 self-end lg:h-10"
          onClick={() => {
            resetPagination();
            setActiveUserSearch(userSearchInput.trim());
          }}
        >
          <Search className="size-4" />
          Apply
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={pagedRedemptions}
        loading={
          status === "LoadingFirstPage" ||
          (status === "LoadingMore" && pagedRedemptions.length === 0)
        }
        emptyMessage="No usage matches these filters."
        getRowId={(row) => row.redemptionId}
        pagination={{
          page,
          pageSize,
          totalCount: redemptions.length,
          totalPages: loadedPages,
          hasNextPage,
          hasPreviousPage: page > 1,
          onPageChange: handlePageChange,
          onPageSizeChange: (next) => {
            setPage(1);
            setPageSize(next);
          },
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          unknownTotal: true,
        }}
      />
    </div>
  );
}
