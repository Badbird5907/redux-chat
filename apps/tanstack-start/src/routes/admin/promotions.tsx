import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { Copy, Gift, Percent, Plus } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { Input } from "@redux/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Switch } from "@redux/ui/components/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@redux/ui/components/table";
import { cn } from "@redux/ui/lib/utils";

import { useQuery } from "@/lib/hooks/convex";

const promotionsApi = api.functions.promotions;

export const Route = createFileRoute("/admin/promotions")({
  head: () => ({
    meta: [{ title: "Promotions | Admin | Redux Chat" }],
  }),
  component: AdminPromotionsPage,
});

type PromotionType = "gifted_credits" | "subscription_discount";
type PromotionStatus = "active" | "paused" | "archived";
type DiscountType = "fixed" | "percentage";
type Duration = "once" | "forever" | "repeating";
type Tier = "plus" | "pro";

type PromotionRow = {
  promotionId: string;
  code: string;
  name: string;
  type: PromotionType;
  status: PromotionStatus;
  startsAt?: number;
  endsAt?: number;
  maxRedemptions?: number;
  redemptionCount: number;
  createdAt: number;
};

type PromotionForm = {
  type: PromotionType;
  name: string;
  code: string;
  description: string;
  status: PromotionStatus;
  startsAt: string;
  endsAt: string;
  maxRedemptions: string;
  singleUsePerUser: boolean;
  newPaidSubscriptionsOnly: boolean;
  creditAmount: string;
  creditExpiryType: "none" | "absolute" | "relative";
  creditExpiryAt: string;
  creditExpiryDays: string;
  eligibleTiers: Tier[];
  discountType: DiscountType;
  amountUsd: string;
  percent: string;
  duration: Duration;
  durationInMonths: string;
};

const defaultForm: PromotionForm = {
  type: "gifted_credits",
  name: "",
  code: "",
  description: "",
  status: "active",
  startsAt: "",
  endsAt: "",
  maxRedemptions: "",
  singleUsePerUser: true,
  newPaidSubscriptionsOnly: true,
  creditAmount: "100000",
  creditExpiryType: "none",
  creditExpiryAt: "",
  creditExpiryDays: "30",
  eligibleTiers: ["plus", "pro"],
  discountType: "percentage",
  amountUsd: "5.00",
  percent: "20",
  duration: "once",
  durationInMonths: "3",
};

function AdminPromotionsPage() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const isIndexRoute =
    pathname === "/admin/promotions" || pathname === "/admin/promotions/";

  return isIndexRoute ? <AdminPromotionsListPage /> : <Outlet />;
}

function AdminPromotionsListPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<PromotionType | "all">("all");
  const [status, setStatus] = useState<PromotionStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const list = useQuery(promotionsApi.adminListPromotions, {
    search: search.trim() || undefined,
    type: type === "all" ? undefined : type,
    status: status === "all" ? undefined : status,
    paginationOpts: { numItems: 100, cursor: null },
  });
  const archivePromotion = useMutation(promotionsApi.adminArchivePromotion);

  const rows = (list?.page ?? []) as PromotionRow[];

  const copyLink = async (code: string) => {
    const origin = window.location.origin;
    await navigator.clipboard.writeText(`${origin}/promo/${code}`);
    toast.success("Promo link copied.");
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-foreground text-3xl font-semibold tracking-tight">
            Promotions
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Create gifted credit and discounted subscription campaigns.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-2"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-4" aria-hidden />
          New promotion
        </Button>
      </div>

      <CreatePromotionDialog open={createOpen} onOpenChange={setCreateOpen} />

      <Card className="bg-muted/25 gap-4 p-4 shadow-none">
        <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search code or name"
          />
          <Select
            value={type}
            onValueChange={(value) => {
              if (isPromotionTypeFilter(value)) {
                setType(value);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{typeFilterLabel(type)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="gifted_credits">Gifted credits</SelectItem>
              <SelectItem value="subscription_discount">
                Subscription
              </SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(value) => {
              if (isPromotionStatusFilter(value)) {
                setStatus(value);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{statusFilterLabel(status)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Promotion</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Redeemed</TableHead>
              <TableHead>Window</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-muted-foreground py-10 text-center"
                >
                  No promotions found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((promo) => (
                <TableRow key={promo.promotionId}>
                  <TableCell>
                    <div className="flex flex-col">
                      <Link
                        to="/admin/promotions/$promotionId"
                        params={{ promotionId: promo.promotionId }}
                        className="font-medium hover:underline"
                      >
                        {promo.name}
                      </Link>
                      <span className="text-muted-foreground font-mono text-xs">
                        {promo.code}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={promo.type} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={promo.status} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {promo.redemptionCount}
                    {promo.maxRedemptions
                      ? ` / ${promo.maxRedemptions}`
                      : " / unlimited"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatWindow(promo.startsAt, promo.endsAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Copy promo link"
                        onClick={() => void copyLink(promo.code)}
                      >
                        <Copy className="size-4" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        render={
                          <Link
                            to="/admin/promotions/$promotionId"
                            params={{ promotionId: promo.promotionId }}
                          />
                        }
                      >
                        Open
                      </Button>
                      {promo.status !== "archived" ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() =>
                            void archivePromotion({
                              promotionId: promo.promotionId,
                            })
                          }
                        >
                          Archive
                        </Button>
                      ) : null}
                    </div>
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

function CreatePromotionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createPromotion = useAction(promotionsApi.adminCreatePromotion);
  const [form, setForm] = useState<PromotionForm>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payload = useMemo(() => buildPromotionPayload(form), [form]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await createPromotion(payload);
      setForm(defaultForm);
      onOpenChange(false);
      toast.success("Promotion created.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not create promotion.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New promotion</DialogTitle>
          <DialogDescription>
            Create a promo code for gifted credits or subscription discounts.
          </DialogDescription>
        </DialogHeader>
        <PromotionFormFields
          form={form}
          onChange={setForm}
          disabled={submitting}
        />
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PromotionFormFields({
  form,
  onChange,
  disabled = false,
  locked = false,
}: {
  form: PromotionForm;
  onChange: (next: PromotionForm) => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const set = <K extends keyof PromotionForm>(
    key: K,
    value: PromotionForm[K],
  ) => onChange({ ...form, [key]: value });

  const toggleTier = (tier: Tier) => {
    const next = form.eligibleTiers.includes(tier)
      ? form.eligibleTiers.filter((item) => item !== tier)
      : [...form.eligibleTiers, tier];
    set("eligibleTiers", next.length > 0 ? next : [tier]);
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select
            value={form.type}
            onValueChange={(value) => {
              if (isPromotionType(value)) {
                set("type", value);
              }
            }}
            disabled={disabled || locked}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{promotionTypeLabel(form.type)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gifted_credits">Gifted credits</SelectItem>
              <SelectItem value="subscription_discount">
                Subscription discount
              </SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={form.status}
            onValueChange={(value) => {
              if (isPromotionStatus(value)) {
                set("status", value);
              }
            }}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{statusFilterLabel(form.status)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            disabled={disabled}
            placeholder="Launch week"
          />
        </Field>
        <Field label="Code">
          <div className="flex gap-2">
            <Input
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
              disabled={disabled || locked}
              placeholder="LAUNCH20"
            />
            <Button
              type="button"
              variant="outline"
              disabled={disabled || locked}
              onClick={() => set("code", generateCode())}
            >
              Generate
            </Button>
          </div>
        </Field>
      </div>

      <Field label="Description">
        <Input
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          disabled={disabled}
          placeholder="Internal note"
        />
      </Field>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Starts">
          <Input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => set("startsAt", e.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Ends">
          <Input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => set("endsAt", e.target.value)}
            disabled={disabled}
          />
        </Field>
        <Field label="Max redemptions">
          <Input
            inputMode="numeric"
            value={form.maxRedemptions}
            onChange={(e) => set("maxRedemptions", e.target.value)}
            disabled={disabled}
            placeholder="Unlimited"
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <ToggleField
          label="Single redemption per user"
          description="Show the already-redeemed state and block repeat redemptions."
          checked={form.singleUsePerUser}
          disabled={disabled}
          onCheckedChange={(checked) => set("singleUsePerUser", checked)}
        />
        {form.type === "subscription_discount" ? (
          <ToggleField
            label="New paid subscriptions only"
            description="Show the new-subscription restriction for existing paid users."
            checked={form.newPaidSubscriptionsOnly}
            disabled={disabled}
            onCheckedChange={(checked) =>
              set("newPaidSubscriptionsOnly", checked)
            }
          />
        ) : null}
      </div>

      {form.type === "gifted_credits" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Credits">
            <Input
              inputMode="numeric"
              value={form.creditAmount}
              onChange={(e) => set("creditAmount", e.target.value)}
              disabled={disabled || locked}
            />
          </Field>
          <Field label="Credit expiry">
            <Select
              value={form.creditExpiryType}
              onValueChange={(value) => {
                if (isCreditExpiryType(value)) {
                  set("creditExpiryType", value);
                }
              }}
              disabled={disabled || locked}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {creditExpiryLabel(form.creditExpiryType)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No expiry</SelectItem>
                <SelectItem value="absolute">Fixed date</SelectItem>
                <SelectItem value="relative">Days after redeem</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {form.creditExpiryType === "absolute" ? (
            <Field label="Expires">
              <Input
                type="datetime-local"
                value={form.creditExpiryAt}
                onChange={(e) => set("creditExpiryAt", e.target.value)}
                disabled={disabled || locked}
              />
            </Field>
          ) : form.creditExpiryType === "relative" ? (
            <Field label="Days">
              <Input
                inputMode="numeric"
                value={form.creditExpiryDays}
                onChange={(e) => set("creditExpiryDays", e.target.value)}
                disabled={disabled || locked}
              />
            </Field>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            {(["plus", "pro"] as const).map((tier) => (
              <Button
                key={tier}
                type="button"
                variant={
                  form.eligibleTiers.includes(tier) ? "default" : "outline"
                }
                size="sm"
                disabled={disabled || locked}
                onClick={() => toggleTier(tier)}
                className={cn(
                  !form.eligibleTiers.includes(tier) && "bg-transparent",
                )}
              >
                {tier === "plus" ? "Plus" : "Pro"}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Discount">
              <Select
                value={form.discountType}
                onValueChange={(value) => {
                  if (isDiscountType(value)) {
                    set("discountType", value);
                  }
                }}
                disabled={disabled || locked}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {discountTypeLabel(form.discountType)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">% off</SelectItem>
                  <SelectItem value="fixed">$ off</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={form.discountType === "fixed" ? "Amount USD" : "Percent"}
            >
              <Input
                inputMode="decimal"
                value={
                  form.discountType === "fixed" ? form.amountUsd : form.percent
                }
                onChange={(e) =>
                  form.discountType === "fixed"
                    ? set("amountUsd", e.target.value)
                    : set("percent", e.target.value)
                }
                disabled={disabled || locked}
              />
            </Field>
            <Field label="Duration">
              <Select
                value={form.duration}
                onValueChange={(value) => {
                  if (isDuration(value)) {
                    set("duration", value);
                  }
                }}
                disabled={disabled || locked}
              >
                <SelectTrigger className="w-full">
                  <SelectValue>{durationLabel(form.duration)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once">Once</SelectItem>
                  <SelectItem value="forever">Forever</SelectItem>
                  <SelectItem value="repeating">Repeating</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {form.duration === "repeating" ? (
              <Field label="Months">
                <Input
                  inputMode="numeric"
                  value={form.durationInMonths}
                  onChange={(e) => set("durationInMonths", e.target.value)}
                  disabled={disabled || locked}
                />
              </Field>
            ) : null}
          </div>
        </div>
      )}
      {locked ? (
        <p className="text-muted-foreground text-xs">
          Value fields are locked because this promotion has confirmed
          redemptions.
        </p>
      ) : null}
    </div>
  );
}

export function buildPromotionPayload(form: PromotionForm) {
  const base = {
    code: form.code,
    name: form.name,
    description: form.description || undefined,
    type: form.type,
    status: form.status,
    startsAt: dateTimeToMs(form.startsAt),
    endsAt: dateTimeToMs(form.endsAt),
    maxRedemptions: optionalInt(form.maxRedemptions),
    singleUsePerUser: form.singleUsePerUser,
  };
  if (form.type === "gifted_credits") {
    return {
      ...base,
      creditAmount: optionalInt(form.creditAmount),
      creditExpiryPolicy:
        form.creditExpiryType === "absolute"
          ? {
              type: "absolute" as const,
              expiresAt: dateTimeToMs(form.creditExpiryAt) ?? 0,
            }
          : form.creditExpiryType === "relative"
            ? {
                type: "relative" as const,
                days: optionalInt(form.creditExpiryDays) ?? 0,
              }
            : { type: "none" as const },
    };
  }
  return {
    ...base,
    eligibleTiers: form.eligibleTiers,
    newPaidSubscriptionsOnly: form.newPaidSubscriptionsOnly,
    discountType: form.discountType,
    amountCents:
      form.discountType === "fixed"
        ? dollarsToCents(form.amountUsd)
        : undefined,
    percentBasisPoints:
      form.discountType === "percentage"
        ? Math.round(Number(form.percent) * 100)
        : undefined,
    duration: form.duration,
    durationInMonths:
      form.duration === "repeating"
        ? optionalInt(form.durationInMonths)
        : undefined,
  };
}

export function formFromPromotion(promo: {
  type: PromotionType;
  name: string;
  code: string;
  description?: string;
  status: PromotionStatus;
  startsAt?: number;
  endsAt?: number;
  maxRedemptions?: number;
  singleUsePerUser?: boolean;
  newPaidSubscriptionsOnly?: boolean;
  creditAmount?: number;
  creditExpiryPolicy?: PromotionForm["creditExpiryType"] extends never
    ? never
    :
        | { type: "none" }
        | { type: "absolute"; expiresAt: number }
        | { type: "relative"; days: number };
  eligibleTiers?: Tier[];
  discountType?: DiscountType;
  amountCents?: number;
  percentBasisPoints?: number;
  duration?: Duration;
  durationInMonths?: number;
}): PromotionForm {
  const policy = promo.creditExpiryPolicy ?? { type: "none" as const };
  return {
    ...defaultForm,
    type: promo.type,
    name: promo.name,
    code: promo.code,
    description: promo.description ?? "",
    status: promo.status,
    startsAt: msToDateTime(promo.startsAt),
    endsAt: msToDateTime(promo.endsAt),
    maxRedemptions: promo.maxRedemptions?.toString() ?? "",
    singleUsePerUser: promo.singleUsePerUser ?? true,
    newPaidSubscriptionsOnly: promo.newPaidSubscriptionsOnly ?? true,
    creditAmount: promo.creditAmount?.toString() ?? defaultForm.creditAmount,
    creditExpiryType: policy.type,
    creditExpiryAt:
      policy.type === "absolute" ? msToDateTime(policy.expiresAt) : "",
    creditExpiryDays:
      policy.type === "relative" ? policy.days.toString() : "30",
    eligibleTiers: promo.eligibleTiers ?? ["plus", "pro"],
    discountType: promo.discountType ?? "percentage",
    amountUsd:
      promo.amountCents !== undefined
        ? (promo.amountCents / 100).toFixed(2)
        : "5.00",
    percent:
      promo.percentBasisPoints !== undefined
        ? String(promo.percentBasisPoints / 100)
        : "20",
    duration: promo.duration ?? "once",
    durationInMonths: promo.durationInMonths?.toString() ?? "3",
  };
}

export function TypeBadge({ type }: { type: PromotionType }) {
  return (
    <Badge variant="outline" className="gap-1.5">
      {type === "gifted_credits" ? (
        <Gift className="size-3" aria-hidden />
      ) : (
        <Percent className="size-3" aria-hidden />
      )}
      {type === "gifted_credits" ? "Gifted" : "Subscription"}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: PromotionStatus }) {
  return (
    <Badge
      variant="outline"
      color={
        status === "active" ? "green" : status === "paused" ? "yellow" : "muted"
      }
    >
      {status}
    </Badge>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </label>
  );
}

function ToggleField({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="border-border bg-background/50 flex items-start justify-between gap-4 rounded-lg border p-3">
      <div className="grid gap-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs leading-5">
          {description}
        </span>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function generateCode() {
  return `PROMO${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isPromotionType(value: unknown): value is PromotionType {
  return value === "gifted_credits" || value === "subscription_discount";
}

function typeFilterLabel(value: PromotionType | "all") {
  if (value === "all") {
    return "All types";
  }
  return promotionTypeLabel(value);
}

function promotionTypeLabel(value: PromotionType) {
  return value === "gifted_credits" ? "Gifted credits" : "Subscription";
}

function isPromotionTypeFilter(value: unknown): value is PromotionType | "all" {
  return value === "all" || isPromotionType(value);
}

function isPromotionStatus(value: unknown): value is PromotionStatus {
  return value === "active" || value === "paused" || value === "archived";
}

function statusFilterLabel(value: PromotionStatus | "all") {
  if (value === "all") {
    return "All statuses";
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isPromotionStatusFilter(
  value: unknown,
): value is PromotionStatus | "all" {
  return value === "all" || isPromotionStatus(value);
}

function isCreditExpiryType(
  value: unknown,
): value is PromotionForm["creditExpiryType"] {
  return value === "none" || value === "absolute" || value === "relative";
}

function creditExpiryLabel(value: PromotionForm["creditExpiryType"]) {
  if (value === "absolute") {
    return "Fixed date";
  }
  if (value === "relative") {
    return "Days after redeem";
  }
  return "No expiry";
}

function isDiscountType(value: unknown): value is DiscountType {
  return value === "fixed" || value === "percentage";
}

function discountTypeLabel(value: DiscountType) {
  return value === "fixed" ? "$ off" : "% off";
}

function isDuration(value: unknown): value is Duration {
  return value === "once" || value === "forever" || value === "repeating";
}

function durationLabel(value: Duration) {
  if (value === "forever") {
    return "Forever";
  }
  if (value === "repeating") {
    return "Repeating";
  }
  return "Once";
}

function optionalInt(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function dollarsToCents(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : undefined;
}

function dateTimeToMs(value: string) {
  if (!value) {
    return undefined;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

function msToDateTime(value: number | undefined) {
  if (value === undefined) {
    return "";
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: number | undefined) {
  if (value === undefined) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatWindow(
  startsAt: number | undefined,
  endsAt: number | undefined,
) {
  if (!startsAt && !endsAt) {
    return "Always";
  }
  return `${formatDate(startsAt)} - ${formatDate(endsAt)}`;
}

export { defaultForm, formatDate, formatWindow };
