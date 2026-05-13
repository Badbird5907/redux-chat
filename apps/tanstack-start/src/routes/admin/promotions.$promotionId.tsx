import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@redux/ui/components/table";

import { useQuery } from "@/lib/hooks/convex";
import {
  buildPromotionPayload,
  formatDate,
  formatWindow,
  formFromPromotion,
  PromotionFormFields,
  StatusBadge,
  TypeBadge,
} from "./promotions";

const promotionsApi = api.functions.promotions;

export const Route = createFileRoute("/admin/promotions/$promotionId")({
  head: () => ({
    meta: [{ title: "Promotion | Admin | Redux Chat" }],
  }),
  component: AdminPromotionDetailPage,
});

type Redemption = {
  redemptionId: string;
  userId: string;
  user?: {
    email?: string;
    name?: string;
  };
  status: "applied" | "checkout_created" | "confirmed" | "expired" | "failed";
  targetTier?: "plus" | "pro";
  polarCheckoutId?: string;
  polarOrderId?: string;
  polarSubscriptionId?: string;
  createdAt: number;
  confirmedAt?: number;
};

function AdminPromotionDetailPage() {
  const { promotionId } = Route.useParams();
  const promo = useQuery(promotionsApi.adminGetPromotion, {
    promotionId,
  });
  const redemptions = useQuery(promotionsApi.adminListPromotionRedemptions, {
    promotionId,
    paginationOpts: { numItems: 100, cursor: null },
  });
  const updatePromotion = useAction(promotionsApi.adminUpdatePromotion);
  const archivePromotion = useMutation(promotionsApi.adminArchivePromotion);
  const redemptionRows = useMemo(
    () => (redemptions?.page ?? []) as Redemption[],
    [redemptions?.page],
  );
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of redemptionRows) {
      map.set(row.status, (map.get(row.status) ?? 0) + 1);
    }
    return map;
  }, [redemptionRows]);

  if (promo === undefined) {
    return (
      <p className="text-muted-foreground text-sm">Loading promotion...</p>
    );
  }
  if (promo === null) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm">Promotion not found.</p>
      </div>
    );
  }

  const promoUrl =
    typeof window === "undefined"
      ? `/promo/${promo.code}`
      : `${window.location.origin}/promo/${promo.code}`;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to="/admin/promotions"
            className="text-muted-foreground text-sm hover:underline"
          >
            Promotions
          </Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-foreground text-3xl font-semibold tracking-tight">
              {promo.name}
            </h1>
            <StatusBadge status={promo.status} />
            <TypeBadge type={promo.type} />
          </div>
          <p className="text-muted-foreground mt-2 font-mono text-sm">
            {promo.code}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              void navigator.clipboard.writeText(promoUrl);
              toast.success("Promo link copied.");
            }}
          >
            <Copy className="size-4" aria-hidden />
            Copy link
          </Button>
          {promo.status !== "archived" ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void archivePromotion({ promotionId })}
            >
              Archive
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <PromotionEditCard
          promotionId={promotionId}
          promo={promo}
          updatePromotion={updatePromotion}
        />

        <div className="grid content-start gap-4">
          <Card className="bg-muted/25 gap-3 p-5 shadow-none">
            <h2 className="font-semibold">Summary</h2>
            <Info
              label="Redeemed"
              value={`${promo.redemptionCount}${promo.maxRedemptions ? ` / ${promo.maxRedemptions}` : " / unlimited"}`}
            />
            <Info
              label="Window"
              value={formatWindow(promo.startsAt, promo.endsAt)}
            />
            <Info label="Created" value={formatDate(promo.createdAt)} />
            {promo.polarDiscountId ? (
              <Info label="Polar discount" value={promo.polarDiscountId} mono />
            ) : null}
            <a
              href={promoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
            >
              Public promo page
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </Card>
          <Card className="bg-muted/25 gap-3 p-5 shadow-none">
            <h2 className="font-semibold">Redemption states</h2>
            {[
              "applied",
              "checkout_created",
              "confirmed",
              "failed",
              "expired",
            ].map((status) => (
              <div
                key={status}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-muted-foreground">{status}</span>
                <Badge variant="outline">{counts.get(status) ?? 0}</Badge>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <Card className="bg-muted/25 gap-4 p-5 shadow-none">
        <h2 className="font-semibold">Redemptions</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Polar</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {redemptionRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-muted-foreground py-8 text-center"
                >
                  No redemptions yet.
                </TableCell>
              </TableRow>
            ) : (
              redemptionRows.map((row) => (
                <TableRow key={row.redemptionId}>
                  <TableCell>
                    <Link
                      to="/admin/users/$userId"
                      params={{ userId: row.userId }}
                      className="hover:text-primary inline-flex max-w-[420px] flex-col gap-0.5 hover:underline"
                    >
                      <span className="truncate text-sm font-medium">
                        {row.user?.email ?? row.user?.name ?? row.userId}
                      </span>
                      {row.user?.email ? (
                        <span className="text-muted-foreground truncate font-mono text-xs">
                          {row.userId}
                        </span>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                  <TableCell>{row.targetTier ?? "-"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[260px] truncate font-mono text-xs">
                    {row.polarOrderId ??
                      row.polarSubscriptionId ??
                      row.polarCheckoutId ??
                      "-"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(row.createdAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function PromotionEditCard({
  promotionId,
  promo,
  updatePromotion,
}: {
  promotionId: string;
  promo: Parameters<typeof formFromPromotion>[0] & { redemptionCount: number };
  updatePromotion: (args: {
    promotionId: string;
    patch: ReturnType<typeof buildPromotionPayload>;
  }) => Promise<unknown>;
}) {
  const [form, setForm] = useState(() => formFromPromotion(promo));
  const [saving, setSaving] = useState(false);
  const locked = promo.redemptionCount > 0;

  const save = async () => {
    setSaving(true);
    try {
      await updatePromotion({
        promotionId,
        patch: buildPromotionPayload(form),
      });
      toast.success("Promotion updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update promotion.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-muted/25 gap-5 p-5 shadow-none">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-semibold">Configuration</h2>
        <Button
          type="button"
          size="sm"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      <PromotionFormFields
        form={form}
        onChange={setForm}
        disabled={saving}
        locked={locked}
      />
    </Card>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={mono ? "font-mono text-xs break-all" : undefined}>
        {value}
      </span>
    </div>
  );
}
