"use no memo";

import { useMemo, useState } from "react";
import { useQuery as useConvexQuery, usePaginatedQuery } from "convex/react";
import {
  AlertTriangle,
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";
import { Input } from "@redux/ui/components/input";
import { Label } from "@redux/ui/components/label";
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
  { value: ALL_FILTER_VALUE, label: "Any Status" },
  { value: "success", label: "Success" },
  { value: "failed", label: "Failed" },
] as const;

const SEVERITY_OPTIONS = [
  { value: ALL_FILTER_VALUE, label: "Any Severity" },
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
    <Badge variant="secondary" color="green">
      <CheckCircle2 className="size-3" />
      Success
    </Badge>
  ) : (
    <Badge variant="secondary" color="red">
      <XCircle className="size-3" />
      Failed
    </Badge>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  switch (severity) {
    case "critical":
      return (
        <Badge variant="outline" color="critical">
          <Flame className="size-3" />
          Critical
        </Badge>
      );
    case "high":
      return (
        <Badge variant="outline" color="orange">
          <AlertTriangle className="size-3" />
          High
        </Badge>
      );
    case "medium":
      return (
        <Badge variant="outline" color="yellow">
          <Info className="size-3" />
          Medium
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" color="muted">
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
  emptyMessage,
  renderLabel,
}: {
  id?: string;
  values: string[];
  options: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  emptyMessage: string;
  renderLabel?: (value: string) => string;
}) {
  const display = renderLabel ?? ((v: string) => v);
  const first = values.at(0);
  const triggerLabel =
    values.length === 0
      ? placeholder
      : values.length === 1
        ? display(first ?? placeholder)
        : `${values.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
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
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-72 overflow-y-auto">
        {options.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-xs">
            {emptyMessage}
          </p>
        ) : (
          options.map((option) => (
            <DropdownMenuCheckboxItem
              key={option}
              closeOnClick={false}
              checked={values.includes(option)}
              onCheckedChange={(checked) => {
                if (checked) {
                  onChange([...values, option]);
                } else {
                  onChange(values.filter((v) => v !== option));
                }
              }}
            >
              {display(option)}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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
