"use no memo";

import { useMemo, useState } from "react";
import { useQuery as useConvexQuery, usePaginatedQuery } from "convex/react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Flame,
  Info,
  Minus,
  XCircle,
} from "lucide-react";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@redux/ui/components/command";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@redux/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { Skeleton } from "@redux/ui/components/skeleton";

import { formatDate } from "./utils";

const PAGE_SIZE = 25;
const ALL_FILTER_VALUE = "all";

const STATUS_OPTIONS = [
  { value: ALL_FILTER_VALUE, label: "Any status" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
] as const;

const SEVERITY_OPTIONS = [
  { value: ALL_FILTER_VALUE, label: "Any severity" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
] as const;

type StatusFilter = (typeof STATUS_OPTIONS)[number]["value"];
type SeverityFilter = (typeof SEVERITY_OPTIONS)[number]["value"];

type AuditEntry = {
  _id: string;
  action: string;
  status: string;
  severity: string;
  ipAddress?: string | null;
  createdAt: number;
};

function formatAction(raw: string): string {
  const socialMatch = /^sign-in:social:(.+)$/.exec(raw);
  if (socialMatch) {
    const provider = socialMatch[1] ?? "unknown";
    return `Sign In (${provider.charAt(0).toUpperCase()}${provider.slice(1)})`;
  }
  return raw
    .replace(/[_:-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function StatusBadge({ status }: { status: string }) {
  return status === "success" ? (
    <Badge
      variant="secondary"
      className="gap-1 border-emerald-500/20 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-400"
    >
      <CheckCircle2 className="size-3" />
      Success
    </Badge>
  ) : (
    <Badge
      variant="secondary"
      className="gap-1 border-red-500/20 bg-red-500/10 font-normal text-red-700 dark:text-red-400"
    >
      <XCircle className="size-3" />
      Failed
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-red-500/35 font-normal text-red-700 dark:text-red-400"
        >
          <Flame className="size-3" />
          Critical
        </Badge>
      );
    case "high":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-orange-500/35 font-normal text-orange-700 dark:text-orange-400"
        >
          <AlertTriangle className="size-3" />
          High
        </Badge>
      );
    case "medium":
      return (
        <Badge
          variant="outline"
          className="gap-1 border-yellow-500/35 font-normal text-yellow-700 dark:text-yellow-400"
        >
          <Info className="size-3" />
          Medium
        </Badge>
      );
    default:
      return (
        <Badge
          variant="outline"
          className="text-muted-foreground gap-1 font-normal"
        >
          <Minus className="size-3" />
          Low
        </Badge>
      );
  }
}

function dateInputToTimestamp(value: string, endOfDay = false) {
  if (value === "") {
    return undefined;
  }
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const timestamp = new Date(`${value}${suffix}`).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function isStatusFilter(value: string | null): value is StatusFilter {
  return value === "all" || value === "success" || value === "failed";
}

function isSeverityFilter(value: string | null): value is SeverityFilter {
  return (
    value === "all" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  );
}

function MultiSelect({
  id,
  values,
  options,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  renderLabel,
}: {
  id?: string;
  values: string[];
  options: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyMessage: string;
  renderLabel?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const display = renderLabel ?? ((v: string) => v);
  const triggerLabel =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? display(values[0]!)
        : `${values.length} selected`;

  const toggle = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          />
        }
      >
        <span
          className={
            values.length === 0 ? "text-muted-foreground truncate" : "truncate"
          }
        >
          {triggerLabel}
        </span>
        <ChevronDown className="text-muted-foreground size-4 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const selected = values.includes(option);
                return (
                  <CommandItem
                    key={option}
                    value={option}
                    onSelect={() => toggle(option)}
                  >
                    <Check
                      className={`mr-2 size-4 ${selected ? "opacity-100" : "opacity-0"}`}
                    />
                    {display(option)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function AdminUserActivityTab({
  userId,
  displayName,
}: {
  userId: string;
  displayName: string;
}) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>(ALL_FILTER_VALUE);
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>(ALL_FILTER_VALUE);
  const [actionValues, setActionValues] = useState<string[]>([]);
  const [ipValues, setIpValues] = useState<string[]>([]);

  const facets = useConvexQuery(
    api.functions.adminUserDetail.listAuditLogFacetsForUser,
    { targetUserId: userId },
  );
  const actionOptions = facets?.actions ?? [];
  const ipOptions = facets?.ipAddresses ?? [];

  const queryArgs = useMemo(
    () => ({
      targetUserId: userId,
      from: dateInputToTimestamp(fromDate),
      to: dateInputToTimestamp(toDate, true),
      status: statusFilter === ALL_FILTER_VALUE ? undefined : statusFilter,
      severity:
        severityFilter === ALL_FILTER_VALUE ? undefined : severityFilter,
      actions: actionValues.length === 0 ? undefined : actionValues,
      ipAddresses: ipValues.length === 0 ? undefined : ipValues,
    }),
    [
      actionValues,
      fromDate,
      ipValues,
      severityFilter,
      statusFilter,
      toDate,
      userId,
    ],
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.adminUserDetail.listAuditLogsForUser,
    queryArgs,
    { initialNumItems: PAGE_SIZE },
  );

  const entries = results as AuditEntry[];
  const hasActiveFilters =
    fromDate !== "" ||
    toDate !== "" ||
    statusFilter !== ALL_FILTER_VALUE ||
    severityFilter !== ALL_FILTER_VALUE ||
    actionValues.length > 0 ||
    ipValues.length > 0;

  const clearFilters = () => {
    setFromDate("");
    setToDate("");
    setStatusFilter(ALL_FILTER_VALUE);
    setSeverityFilter(ALL_FILTER_VALUE);
    setActionValues([]);
    setIpValues([]);
  };

  return (
    <section className="border-border/60 bg-card/40 rounded-2xl border">
      <div className="border-border/60 border-b px-5 py-4">
        <h2 className="text-foreground text-sm font-semibold">Activity</h2>
        <p className="text-muted-foreground text-xs">
          Auth events recorded for{" "}
          <span className="text-foreground font-medium">{displayName}</span>.
        </p>
      </div>

      <div className="border-border/60 grid gap-3 border-b px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="activity-from">From</Label>
            <Input
              id="activity-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="activity-to">To</Label>
            <Input
              id="activity-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="activity-status">Status</Label>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                if (isStatusFilter(value)) {
                  setStatusFilter(value);
                }
              }}
            >
              <SelectTrigger id="activity-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="activity-severity">Severity</Label>
            <Select
              value={severityFilter}
              onValueChange={(value) => {
                if (isSeverityFilter(value)) {
                  setSeverityFilter(value);
                }
              }}
            >
              <SelectTrigger id="activity-severity" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITY_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="activity-actions">Actions</Label>
            <MultiSelect
              id="activity-actions"
              values={actionValues}
              options={actionOptions}
              onChange={setActionValues}
              placeholder="Any action"
              searchPlaceholder="Search actions..."
              emptyMessage={
                facets === undefined ? "Loading..." : "No actions yet"
              }
              renderLabel={formatAction}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="activity-ips">IP addresses</Label>
            <MultiSelect
              id="activity-ips"
              values={ipValues}
              options={ipOptions}
              onChange={setIpValues}
              placeholder="Any IP"
              searchPlaceholder="Search IPs..."
              emptyMessage={
                facets === undefined ? "Loading..." : "No IPs recorded"
              }
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            disabled={!hasActiveFilters}
          >
            Clear filters
          </Button>
        </div>
      </div>

      {status === "LoadingFirstPage" ? (
        <div className="space-y-2 px-5 py-5">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground px-5 py-6 text-sm">
          {hasActiveFilters
            ? "No activity matches these filters."
            : "No activity recorded for this user yet."}
        </p>
      ) : (
        <>
          <ul className="divide-border/60 divide-y">
            {entries.map((entry) => (
              <li key={entry._id} className="px-5 py-3.5">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-foreground text-sm font-medium">
                      {formatAction(entry.action)}
                    </span>
                    <StatusBadge status={entry.status} />
                    <SeverityBadge severity={entry.severity} />
                  </div>
                  <dl className="text-muted-foreground flex flex-wrap gap-x-6 text-xs">
                    <div>
                      <dt className="sr-only">Time</dt>
                      <dd>{formatDate(entry.createdAt)}</dd>
                    </div>
                    {entry.ipAddress ? (
                      <div>
                        <dt className="sr-only">IP</dt>
                        <dd className="font-mono">{entry.ipAddress}</dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              </li>
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
  );
}
