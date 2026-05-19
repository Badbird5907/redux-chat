import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { Gift, Search } from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import { formatPerUserRedemptionPolicy } from "@redux/shared";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Input } from "@redux/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@redux/ui/components/table";

import { AdminPageNav } from "@/components/admin/admin-page-nav";
import { PromotionFormDialog } from "@/components/admin/promotion-form-dialog";
import { formatDate } from "@/components/admin/user-detail/utils";

const PAGE_SIZE = 25;

export const Route = createFileRoute("/admin/promotions/")({
  head: () => ({
    meta: [{ title: "Promotions | Admin | Redux Chat" }],
  }),
  component: AdminPromotionsPage,
});

function AdminPromotionsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.promotions.adminListPromotions,
    { search: activeSearch || undefined },
    { initialNumItems: PAGE_SIZE },
  );

  const promotions = useMemo(() => results, [results]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <AdminPageNav
            items={[{ label: "Admin", to: "/admin" }, { label: "Promotions" }]}
          />
          <div className="min-w-0">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight">
              Promotions
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Create codes, control repeat redemption, and track usage.
            </p>
          </div>
        </div>
        <PromotionFormDialog mode="create" />
      </div>

      <div className="flex gap-2">
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search name or code"
          onKeyDown={(e) => {
            if (e.key === "Enter") setActiveSearch(searchInput.trim());
          }}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={() => setActiveSearch(searchInput.trim())}
        >
          <Search className="size-4" />
          Search
        </Button>
      </div>

      <div className="border-border/70 bg-card/60 overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Usage</TableHead>
              <TableHead>Per user</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-muted-foreground h-28 text-center"
                >
                  <Gift className="mx-auto mb-2 size-5" />
                  No promotions found.
                </TableCell>
              </TableRow>
            ) : (
              promotions.map((promotion) => (
                <TableRow key={promotion.promotionId}>
                  <TableCell className="font-mono text-xs">
                    {promotion.code}
                  </TableCell>
                  <TableCell className="font-medium">
                    {promotion.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{promotion.kind}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      color={promotion.status === "active" ? "green" : "red"}
                    >
                      {promotion.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {promotion.redeemedCount.toLocaleString()}
                    {promotion.maxRedemptions
                      ? ` / ${promotion.maxRedemptions.toLocaleString()}`
                      : ""}
                  </TableCell>
                  <TableCell>
                    {formatPerUserRedemptionPolicy(
                      promotion.perUserRedemptionLimit,
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(promotion.startsAt)} -{" "}
                    {formatDate(promotion.endsAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      render={
                        <Link
                          to="/admin/promotions/$promotionId"
                          params={{ promotionId: promotion.promotionId }}
                        />
                      }
                    >
                      Details
                    </Button>
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
