import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, usePaginatedQuery } from "convex/react";
import {
  Ban,
  ChevronDown,
  Coins,
  Gift,
  Plus,
  RefreshCw,
  ShoppingBag,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import type { CreditBucket, UserBillingState } from "@redux/shared";
import { api } from "@redux/backend/convex/_generated/api";
import { CREDIT_BUCKETS } from "@redux/shared";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@redux/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@redux/ui/components/form";
import { Input } from "@redux/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Skeleton } from "@redux/ui/components/skeleton";

import { CreditBalancePanel } from "@/components/billing/credit-balance-panel";
import { formatDate } from "./utils";

const PAGE_SIZE = 20;

const BUCKET_OPTIONS: {
  value: CreditBucket;
  label: string;
  icon: React.ElementType;
}[] = [
  { value: "gifted", label: "Gifted", icon: Gift },
  { value: "monthly", label: "Monthly", icon: RefreshCw },
  { value: "paid", label: "Purchased", icon: ShoppingBag },
];

const STATUS_STYLES: Record<string, string> = {
  active:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  exhausted:
    "border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-400",
  expired: "border-zinc-500/20 bg-zinc-500/10 text-zinc-500",
  revoked: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-400",
};

function isCreditBucket(value: unknown): value is CreditBucket {
  return typeof value === "string" && value in CREDIT_BUCKETS;
}

function utcEndOfCalendarDayMs(yyyyMmDd: string): number | null {
  const parts = yyyyMmDd.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const mo = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    return null;
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || String(y).length !== 4) {
    return null;
  }
  const ms = Date.UTC(y, mo - 1, d, 23, 59, 59, 999);
  return Number.isNaN(ms) ? null : ms;
}

function utcTodayYyyyMmDd(): string {
  const n = new Date();
  const y = n.getUTCFullYear();
  const mo = String(n.getUTCMonth() + 1).padStart(2, "0");
  const d = String(n.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

const grantCreditsFormSchema = z
  .object({
    bucket: z.enum(["gifted", "monthly", "paid"]),
    amount: z.string().trim().min(1, "Enter an amount."),
    expiryDate: z.string(),
    note: z.string().max(200, "Note must be at most 200 characters."),
  })
  .superRefine((data, ctx) => {
    const n = Number(data.amount);
    if (!Number.isInteger(n) || n <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Amount must be a positive integer.",
        path: ["amount"],
      });
    }
    if (data.expiryDate.trim() === "") return;
    const endMs = utcEndOfCalendarDayMs(data.expiryDate.trim());
    if (endMs === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid expiry date.",
        path: ["expiryDate"],
      });
      return;
    }
    if (endMs <= Date.now()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Expiry must be in the future (UTC end of day).",
        path: ["expiryDate"],
      });
    }
  });

type GrantCreditsFormValues = z.infer<typeof grantCreditsFormSchema>;

function formatSource(source: string): string {
  switch (source) {
    case "stripe_subscription_renewal":
      return "Subscription renewal";
    case "stripe_one_time_purchase":
      return "One-time purchase";
    case "free_monthly_reset":
      return "Free monthly allowance";
    case "admin_grant":
      return "Admin grant";
    case "migration_backfill":
      return "Migration backfill";
    default:
      return source;
  }
}

function BucketIcon({ bucket }: { bucket: string }) {
  const option = BUCKET_OPTIONS.find((o) => o.value === bucket);
  if (!option) return <Coins className="size-3.5" />;
  const Icon = option.icon;
  return <Icon className="size-3.5" />;
}

type Grant = {
  _id: string;
  grantId: string;
  bucket: CreditBucket;
  amount: number;
  remaining: number;
  status: string;
  source: string;
  grantedAt: number;
  expiresAt?: number;
  metadata?: unknown;
};

function GrantCreditsForm({
  userId,
  displayName,
  onSuccess,
}: {
  userId: string;
  displayName: string;
  onSuccess: () => void;
}) {
  const [mutationError, setMutationError] = useState<string | null>(null);

  const form = useForm<GrantCreditsFormValues>({
    resolver: zodResolver(grantCreditsFormSchema),
    defaultValues: {
      bucket: "gifted",
      amount: "",
      expiryDate: "",
      note: "",
    },
  });

  const grantCredits = useMutation(
    api.functions.adminUserDetail.adminGrantCreditsForUser,
  );

  const pending = form.formState.isSubmitting;

  const onSubmit = async (values: GrantCreditsFormValues) => {
    setMutationError(null);
    const amount = Number(values.amount.trim());
    const trimmedExpiry = values.expiryDate.trim();
    let expiresAt: number | undefined;
    if (trimmedExpiry !== "") {
      const endMs = utcEndOfCalendarDayMs(trimmedExpiry);
      expiresAt = endMs ?? undefined;
    }
    try {
      await grantCredits({
        targetUserId: userId,
        bucket: values.bucket,
        amount,
        note: values.note.trim() || undefined,
        expiresAt,
      });
      form.reset();
      onSuccess();
    } catch (err) {
      setMutationError(
        err instanceof Error ? err.message : "Failed to grant credits.",
      );
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Grant credits</DialogTitle>
          <DialogDescription>
            Adds a new grant for{" "}
            <span className="text-foreground font-medium">{displayName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <FormField
            control={form.control}
            name="bucket"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bucket</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(value) => {
                    if (isCreditBucket(value)) {
                      field.onChange(value);
                    }
                  }}
                  disabled={pending}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {BUCKET_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Amount (credits)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    placeholder="e.g. 10000"
                    disabled={pending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="expiryDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expires (optional, UTC)</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    min={utcTodayYyyyMmDd()}
                    className="block w-full min-w-0"
                    disabled={pending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="note"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Note (optional)</FormLabel>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="Internal reason"
                    maxLength={200}
                    disabled={pending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {mutationError ? (
          <p className="text-destructive text-xs">{mutationError}</p>
        ) : null}

        <DialogFooter>
          <DialogClose
            render={
              <Button type="button" variant="outline" disabled={pending} />
            }
          >
            Cancel
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? "Granting…" : "Grant"}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function AdminUserGrantHistorySection({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);

  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.adminUserDetail.listGrantsForUser,
    { targetUserId: userId },
    { initialNumItems: PAGE_SIZE },
  );
  const grants = results as Grant[];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <section className="border-border/60 bg-card/40 rounded-2xl border">
        <div className="border-border/60 space-y-2 border-b px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-foreground text-sm font-semibold">
              Grant history
            </h2>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                />
              }
            >
              <Plus className="size-4" />
              Add grant
            </DialogTrigger>
          </div>
          <p className="text-muted-foreground text-xs">
            All credit grants for{" "}
            <span className="text-foreground font-medium">{displayName}</span>.
          </p>
        </div>

        <DialogContent>
          {open ? (
            <GrantCreditsForm
              userId={userId}
              displayName={displayName}
              onSuccess={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>

        {status === "LoadingFirstPage" ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : grants.length === 0 ? (
          <p className="text-muted-foreground px-5 py-6 text-sm">
            No credit grants found for this user.
          </p>
        ) : (
          <>
            <ul className="divide-border/60 divide-y">
              {grants.map((grant) => (
                <GrantRow key={grant._id} grant={grant} targetUserId={userId} />
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
    </Dialog>
  );
}

function GrantRow({
  grant,
  targetUserId,
}: {
  grant: Grant;
  targetUserId: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const revokeGrant = useMutation(
    api.functions.adminUserDetail.adminRevokeCreditGrantForUser,
  );

  const bucketLabel = CREDIT_BUCKETS[grant.bucket].label;
  const statusStyle = STATUS_STYLES[grant.status] ?? STATUS_STYLES.expired;
  const note =
    grant.metadata &&
    typeof grant.metadata === "object" &&
    typeof (grant.metadata as { note?: unknown }).note === "string"
      ? (grant.metadata as { note: string }).note
      : null;

  const canRevoke = grant.status === "active";

  const handleRevoke = async () => {
    setRevoking(true);
    try {
      await revokeGrant({
        targetUserId,
        grantId: grant.grantId,
      });
      toast.success("Grant revoked");
      setConfirmOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to revoke grant",
      );
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <li className="px-5 py-3.5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 font-normal">
                <BucketIcon bucket={grant.bucket} />
                {bucketLabel}
              </Badge>
              <Badge
                variant="secondary"
                className={`font-normal ${statusStyle}`}
              >
                {grant.status.charAt(0).toUpperCase() + grant.status.slice(1)}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {formatSource(grant.source)}
              </span>
            </div>
            {note ? (
              <p className="text-muted-foreground text-xs italic">{note}</p>
            ) : null}
            <dl className="text-muted-foreground flex flex-wrap gap-x-5 text-xs">
              <div>
                <dt className="sr-only">Granted</dt>
                <dd>Granted {formatDate(grant.grantedAt)}</dd>
              </div>
              {grant.expiresAt != null ? (
                <div>
                  <dt className="sr-only">Expires</dt>
                  <dd>Expires {formatDate(grant.expiresAt)}</dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            {canRevoke ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 gap-1"
                onClick={() => setConfirmOpen(true)}
              >
                <Ban className="size-3.5" />
                Revoke
              </Button>
            ) : null}
            <div className="text-right">
              <p className="text-foreground text-sm font-semibold tabular-nums">
                {grant.remaining.toLocaleString()}
                <span className="text-muted-foreground font-normal">
                  {" / "}
                  {grant.amount.toLocaleString()}
                </span>
              </p>
              <p className="text-muted-foreground text-[11px]">
                remaining / total
              </p>
            </div>
          </div>
        </div>
      </li>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Revoke this grant?</DialogTitle>
            <DialogDescription>
              This removes the remaining{" "}
              <span className="text-foreground font-medium tabular-nums">
                {grant.remaining.toLocaleString()}
              </span>{" "}
              credits from this grant. The grant will show as revoked in
              history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={revoking} />
              }
            >
              Cancel
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={revoking}
              onClick={() => void handleRevoke()}
            >
              {revoking ? "Revoking…" : "Revoke grant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AdminUserCreditsTab({
  userId,
  displayName,
  billingState,
}: {
  userId: string;
  displayName: string;
  billingState?: UserBillingState;
}) {
  return (
    <div className="space-y-6">
      <CreditBalancePanel
        bucketBalances={billingState?.bucketBalances}
        expiringSoon={billingState?.expiringSoon}
        includedMonthlyCredits={billingState?.includedMonthlyCredits}
        currentPeriodStart={billingState?.currentPeriodStart}
        currentPeriodEnd={billingState?.currentPeriodEnd}
        label="Credit balance"
      />

      <AdminUserGrantHistorySection userId={userId} displayName={displayName} />
    </div>
  );
}
