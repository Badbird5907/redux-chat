import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";

import type { CreditBucket } from "@redux/shared";
import { CREDIT_BUCKETS } from "@redux/shared";
import { Card } from "@redux/ui/components/card";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@redux/ui/components/progress";
import { Separator } from "@redux/ui/components/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
import { cn } from "@redux/ui/lib/utils";

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function useNowMs(tickMs = 60_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);

  return nowMs;
}

function creditBucketTooltip(bucket: CreditBucket): string {
  switch (bucket) {
    case "gifted":
      return "Promotional credits granted to your account. Spent first.";
    case "monthly":
      return "Recurring plan allowance (free, plus, or pro). Resets each plan period and expires at period end.";
    case "paid":
      return "Credits you purchased as a one-time top-up. Spent last; long-lived.";
  }
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="text-foreground font-mono text-2xl leading-none font-semibold tabular-nums">
        {value}
      </p>
      {hint ? (
        <p className="text-muted-foreground text-[11px]">{hint}</p>
      ) : null}
    </div>
  );
}

function CreditBucketRow({
  label,
  tooltip,
  remaining,
  max,
  active,
  emphasized,
}: {
  label: string;
  tooltip?: string;
  remaining: number;
  max?: number;
  active?: boolean;
  emphasized?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center justify-between rounded-md px-3 py-2.5 text-sm",
        active && "bg-primary/10 ring-primary/20 ring-1",
        emphasized && "mt-1 font-semibold",
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn(emphasized ? "text-foreground" : "text-foreground")}>
          {label}
        </span>
        {tooltip ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={`${label} info`}
                  className="text-muted-foreground hover:text-foreground inline-flex size-4 items-center justify-center rounded-full transition-colors"
                />
              }
            >
              <Info className="size-3" aria-hidden />
            </TooltipTrigger>
            <TooltipContent>{tooltip}</TooltipContent>
          </Tooltip>
        ) : null}
      </span>
      <span className="text-foreground tabular-nums">
        {max !== undefined
          ? `${formatNumber(remaining)} / ${formatNumber(max)}`
          : formatNumber(remaining)}
      </span>
    </li>
  );
}

/**
 * Credit Balance card — stacked-row layout that lists every bucket plus
 * a period-summary block (big total, usage progress, period dates, plan
 * stats). The currently-draining bucket (the lowest-priority bucket with
 * credits remaining) is highlighted to mirror allocation order:
 * gifted → monthly → paid.
 */
export function CreditBalancePanel({
  bucketBalances,
  expiringSoon,
  includedMonthlyCredits,
  currentPeriodStart,
  currentPeriodEnd,
  label = "Credit balance",
}: {
  bucketBalances: Record<CreditBucket, number> | undefined;
  expiringSoon:
    | {
        bucket: CreditBucket;
        grantId: string;
        remaining: number;
        expiresAt: number;
      }[]
    | undefined;
  includedMonthlyCredits: number | undefined;
  currentPeriodStart: number | undefined;
  currentPeriodEnd: number | undefined;
  label?: string;
}) {
  const nowMs = useNowMs();
  const orderedBuckets = useMemo<CreditBucket[]>(
    () =>
      (Object.keys(CREDIT_BUCKETS) as CreditBucket[]).sort(
        (a, b) => CREDIT_BUCKETS[a].priority - CREDIT_BUCKETS[b].priority,
      ),
    [],
  );

  const balances: Record<CreditBucket, number> = bucketBalances ?? {
    gifted: 0,
    monthly: 0,
    paid: 0,
  };
  const total = orderedBuckets.reduce((sum, b) => sum + balances[b], 0);

  const activeBucket: CreditBucket | undefined = orderedBuckets.find(
    (b) => balances[b] > 0,
  );

  const periodBucket: CreditBucket = "monthly";
  const periodRemaining = balances[periodBucket];
  const periodMax = includedMonthlyCredits;

  const periodUsed =
    periodMax !== undefined
      ? Math.max(0, periodMax - periodRemaining)
      : undefined;
  const periodUsedPct =
    periodMax !== undefined && periodMax > 0 && periodUsed !== undefined
      ? Math.min(100, Math.round((periodUsed / periodMax) * 100))
      : undefined;

  const periodMaxByBucket: Partial<Record<CreditBucket, number>> = {};
  if (periodMax !== undefined) {
    periodMaxByBucket[periodBucket] = periodMax;
  }

  const daysUntilReset =
    currentPeriodEnd != null
      ? Math.max(0, Math.ceil((currentPeriodEnd - nowMs) / 86_400_000))
      : undefined;

  const periodEndDateLabel =
    currentPeriodEnd != null
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
          currentPeriodEnd,
        )
      : null;
  const periodStartDateLabel =
    currentPeriodStart != null
      ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
          currentPeriodStart,
        )
      : null;

  return (
    <section className="space-y-3">
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <Card className="bg-muted/35 ring-border gap-0 overflow-hidden p-0 py-0 shadow-none">
        <div className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Stat
              label="Total available"
              value={formatNumber(total)}
              hint={
                total === 0
                  ? "Credits left to spend"
                  : `Across ${
                      orderedBuckets.filter((b) => balances[b] > 0).length
                    } bucket${
                      orderedBuckets.filter((b) => balances[b] > 0).length === 1
                        ? ""
                        : "s"
                    }`
              }
            />
            <Stat
              label="Used this period"
              value={periodUsed !== undefined ? formatNumber(periodUsed) : "—"}
              hint={
                periodMax !== undefined
                  ? `of ${formatNumber(periodMax)} included`
                  : "Usage details loading"
              }
            />
            <Stat
              label="Resets"
              value={daysUntilReset !== undefined ? `${daysUntilReset}d` : "—"}
              hint={periodEndDateLabel ?? "Renewal date loading"}
            />
          </div>

          {periodUsedPct !== undefined ? (
            <Progress
              value={periodUsedPct}
              aria-label={`${CREDIT_BUCKETS[periodBucket].label} credits used this period`}
              className="flex-col gap-2 [&_[data-slot=progress-track]]:h-1.5"
            >
              <div className="flex w-full items-baseline justify-between gap-3">
                <ProgressLabel className="text-muted-foreground text-xs font-normal">
                  {CREDIT_BUCKETS[periodBucket].label} credits ·{" "}
                  {periodStartDateLabel
                    ? `${periodStartDateLabel} →`
                    : "this period"}{" "}
                  {periodEndDateLabel ?? ""}
                </ProgressLabel>
                <ProgressValue
                  className="text-foreground shrink-0 text-xs font-medium tabular-nums"
                  render={
                    <span>{`${formatNumber(periodRemaining)} / ${formatNumber(
                      periodMax ?? 0,
                    )}`}</span>
                  }
                />
              </div>
            </Progress>
          ) : null}
        </div>

        <Separator />

        <ul className="px-3 py-3">
          {orderedBuckets.map((bucket) => {
            const remaining = balances[bucket];
            const max = periodMaxByBucket[bucket];
            return (
              <CreditBucketRow
                key={bucket}
                label={`${CREDIT_BUCKETS[bucket].label} Credits`}
                tooltip={creditBucketTooltip(bucket)}
                remaining={remaining}
                max={max}
                active={bucket === activeBucket}
              />
            );
          })}
          <CreditBucketRow
            label="Total Available Credits"
            remaining={total}
            emphasized
          />
        </ul>

        {expiringSoon && expiringSoon.length > 0 ? (
          <>
            <Separator />
            <p className="text-muted-foreground px-5 py-3 text-xs">
              <Info
                className="mr-1.5 inline-block size-3.5 align-[-2px]"
                aria-hidden
              />
              {expiringSoon
                .slice(0, 3)
                .map(
                  (g) =>
                    `${formatNumber(g.remaining)} ${CREDIT_BUCKETS[g.bucket].label.toLowerCase()} credits expire ${new Intl.DateTimeFormat(
                      "en-US",
                      { dateStyle: "medium" },
                    ).format(g.expiresAt)}`,
                )
                .join(" · ")}
            </p>
          </>
        ) : null}
      </Card>
    </section>
  );
}
