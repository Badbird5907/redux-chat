import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useAction,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import { ArrowLeft, Ban, Copy, Pause, Search } from "lucide-react";
import { toast } from "sonner";

import type { PromotionRedemptionStatus } from "@redux/shared";
import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@redux/ui/components/table";

import { formatDate } from "@/components/admin/user-detail/utils";

const PAGE_SIZE = 25;
const ALL_STATUSES = "all";

export const Route = createFileRoute("/admin/promotions/$promotionId")({
  head: ({ params }) => ({
    meta: [
      {
        title: `Promotion ${params.promotionId.slice(0, 8)} | Admin | Redux Chat`,
      },
    ],
  }),
  component: AdminPromotionDetailPage,
});

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

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border-border/70 bg-card/60 rounded-xl border px-4 py-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground mt-1 text-xl font-semibold tabular-nums">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
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

function StripeIds({ redemption }: { redemption: RedemptionStripeFields }) {
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

  if (rows.length === 0) return <>—</>;

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
          checkout expires: {formatDate(redemption.stripeCheckoutSessionExpiresAt)}
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

function AdminPromotionDetailPage() {
  const { promotionId } = Route.useParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL_STATUSES);
  const [userSearchInput, setUserSearchInput] = useState("");
  const [activeUserSearch, setActiveUserSearch] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [repeatedOnly, setRepeatedOnly] = useState(false);

  const detail = useQuery(api.functions.promotions.adminGetPromotion, {
    promotionId,
  });
  const pausePromotion = useMutation(
    api.functions.promotions.adminPausePromotion,
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
    { initialNumItems: PAGE_SIZE },
  );

  if (detail === undefined) {
    return <p className="text-muted-foreground text-sm">Loading promotion…</p>;
  }

  const { promotion, usageSummary } = detail;
  const redemptions = results;
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

  const pause = async () => {
    try {
      await pausePromotion({ promotionId });
      toast.success("Promotion paused");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Pause failed");
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

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mb-4"
          render={<Link to="/admin/promotions" />}
        >
          <ArrowLeft className="size-4" />
          Promotions
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-foreground text-3xl font-semibold tracking-tight">
                {promotion.name}
              </h1>
              <Badge variant="secondary">{promotion.status}</Badge>
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
            <Button type="button" variant="outline" onClick={copyRedeemUrl}>
              <Copy className="size-4" />
              Copy URL
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={promotion.status === "paused"}
              onClick={() => void pause()}
            >
              <Pause className="size-4" />
              Pause
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={promotion.status === "archived"}
              onClick={() => void archive()}
            >
              <Ban className="size-4" />
              Archive
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Applied" value={usageSummary.appliedCount} />
        <StatCard label="Reserved" value={usageSummary.reservedCount} />
        <StatCard label="Failed" value={usageSummary.failedCount} />
        <StatCard label="Revoked" value={usageSummary.revokedCount} />
        <StatCard label="Unique users" value={usageSummary.uniqueUserCount} />
        <StatCard label="Repeat users" value={usageSummary.repeatUserCount} />
        <StatCard label="Remaining" value={remaining} />
        <StatCard label="Per user" value={promotion.perUserRedemptionLabel} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[160px_1fr_180px_180px_auto_auto]">
        <div className="grid gap-2">
          <Label>Status</Label>
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              if (isStatusFilter(value)) {
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger>
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
        <div className="grid gap-2">
          <Label htmlFor="promotion-user-filter">User</Label>
          <Input
            id="promotion-user-filter"
            value={userSearchInput}
            onChange={(e) => setUserSearchInput(e.target.value)}
            placeholder="Filter by user id"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setActiveUserSearch(userSearchInput.trim());
              }
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="promotion-from">From</Label>
          <Input
            id="promotion-from"
            type="date"
            value={fromInput}
            onChange={(e) => setFromInput(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="promotion-to">To</Label>
          <Input
            id="promotion-to"
            type="date"
            value={toInput}
            onChange={(e) => setToInput(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant={repeatedOnly ? "default" : "outline"}
          className="self-end"
          onClick={() => setRepeatedOnly((value) => !value)}
        >
          Repeat users
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="self-end"
          onClick={() => setActiveUserSearch(userSearchInput.trim())}
        >
          <Search className="size-4" />
          Apply
        </Button>
      </div>

      <div className="border-border/70 bg-card/60 overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Applied</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Benefit</TableHead>
              <TableHead>Stripe IDs</TableHead>
              <TableHead>Failure</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {redemptions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-muted-foreground h-24 text-center"
                >
                  No usage matches these filters.
                </TableCell>
              </TableRow>
            ) : (
              redemptions.map((redemption) => (
                <TableRow key={redemption.redemptionId}>
                  <TableCell className="max-w-[220px] truncate font-mono text-xs">
                    {redemption.userId}
                    {redemption.isRepeatUser ? (
                      <Badge variant="secondary" className="ml-2">
                        repeat
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{redemption.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDate(redemption.reservedAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {formatDate(redemption.appliedAt)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {redemption.targetTier ?? "—"}
                  </TableCell>
                  <TableCell>{redemption.kind}</TableCell>
                  <TableCell className="max-w-[280px] font-mono text-xs">
                    <StripeIds redemption={redemption} />
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs">
                    {redemption.failureReason ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {redemption.status === "applied" &&
                    redemption.appCreditGrantId ? (
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
                          void revokeStripeInvoiceCredit(
                            redemption.redemptionId,
                          )
                        }
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {status === "CanLoadMore" ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => loadMore(PAGE_SIZE)}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}
