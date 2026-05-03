import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

import {
  type AllocatableGrant,
  CREDIT_BUCKETS,
  type CreditBucket,
  allocateDebit,
  summarizeBalances,
} from "@redux/shared";

import type { DataModel } from "./_generated/dataModel";

export type LedgerQueryCtx = GenericQueryCtx<DataModel>;
export type LedgerMutationCtx = GenericMutationCtx<DataModel>;

export type CreditGrantSource =
  | "polar_subscription_renewal"
  | "polar_one_time_purchase"
  | "free_monthly_reset"
  | "admin_grant"
  | "migration_backfill";

export interface CreditBalance {
  spendableCredits: number;
  bucketBalances: Record<CreditBucket, number>;
  expiringSoon: {
    bucket: CreditBucket;
    grantId: string;
    remaining: number;
    expiresAt: number;
  }[];
}

/** UTC YYYY-MM key for monthly plan allowances. */
export function getMonthlyPeriodKey(timestamp = Date.now()): string {
  const date = new Date(timestamp);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** UTC end-of-current-month timestamp (ms since epoch). */
export function getMonthlyExpiresAt(timestamp = Date.now()): number {
  const date = new Date(timestamp);
  return Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
}

function normalizeGrantBucket(bucket: string): CreditBucket | undefined {
  if (bucket === "free") {
    // Legacy compatibility: old rows used a dedicated `free` bucket before we
    // unified recurring allowances into `monthly`.
    return "monthly";
  }
  if (bucket in CREDIT_BUCKETS) {
    return bucket as CreditBucket;
  }
  return undefined;
}

/**
 * Read all active, unexpired grants for a user. Filters out exhausted /
 * expired / revoked rows so the operational balance is bounded by the live
 * lot count, not the user's lifetime ledger.
 */
export async function listActiveGrantsForUser(
  ctx: LedgerQueryCtx | LedgerMutationCtx,
  userId: string,
  nowMs: number = Date.now(),
): Promise<AllocatableGrant[]> {
  const rows = await ctx.db
    .query("creditGrants")
    .withIndex("by_user_status_expires", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .collect();

  return rows
    .filter((row) => row.remaining > 0)
    .filter((row) => row.expiresAt === undefined || row.expiresAt > nowMs)
    .flatMap((row) => {
      const bucket = normalizeGrantBucket(row.bucket);
      if (!bucket) {
        return [];
      }
      return [
        {
          grantId: row.grantId,
          bucket,
          remaining: row.remaining,
          expiresAt: row.expiresAt,
          grantedAt: row.grantedAt,
        },
      ];
    });
}

export async function getCreditBalanceForUser(
  ctx: LedgerQueryCtx | LedgerMutationCtx,
  userId: string,
  nowMs: number = Date.now(),
): Promise<CreditBalance> {
  const grants = await listActiveGrantsForUser(ctx, userId, nowMs);
  const summary = summarizeBalances({ grants, nowMs });

  const expiringWindowMs = nowMs + 7 * 86_400_000;
  const expiringSoon = grants
    .filter(
      (g) =>
        g.expiresAt !== undefined &&
        g.expiresAt > nowMs &&
        g.expiresAt <= expiringWindowMs,
    )
    .map((g) => ({
      bucket: g.bucket,
      grantId: g.grantId,
      remaining: g.remaining,
      expiresAt: g.expiresAt as number,
    }))
    .sort((a, b) => a.expiresAt - b.expiresAt);

  return {
    spendableCredits: summary.spendableCredits,
    bucketBalances: summary.bucketBalances,
    expiringSoon,
  };
}

export interface GrantCreditsArgs {
  userId: string;
  bucket: CreditBucket;
  amount: number;
  source: CreditGrantSource;
  sourceId: string;
  periodKey?: string;
  expiresAt?: number;
  metadata?: unknown;
}

export interface GrantCreditsResult {
  grantId: string;
  created: boolean;
  amount: number;
  bucket: CreditBucket;
}

/**
 * Idempotent grant insertion. If a row with the same `(source, sourceId)`
 * already exists we return it unchanged — duplicate webhook deliveries and
 * retried free-monthly resets are no-ops.
 */
export async function grantCreditsTx(
  ctx: LedgerMutationCtx,
  args: GrantCreditsArgs,
): Promise<GrantCreditsResult> {
  if (args.amount <= 0) {
    throw new Error("Grant amount must be positive");
  }
  if (!CREDIT_BUCKETS[args.bucket]) {
    throw new Error(`Unknown credit bucket: ${String(args.bucket)}`);
  }

  const existing = await ctx.db
    .query("creditGrants")
    .withIndex("by_source_sourceId", (q) =>
      q.eq("source", args.source).eq("sourceId", args.sourceId),
    )
    .first();
  if (existing) {
    const existingBucket = normalizeGrantBucket(existing.bucket);
    return {
      grantId: existing.grantId,
      created: false,
      amount: existing.amount,
      bucket: existingBucket ?? args.bucket,
    };
  }

  const now = Date.now();
  const grantId = crypto.randomUUID();

  await ctx.db.insert("creditGrants", {
    grantId,
    userId: args.userId,
    bucket: args.bucket,
    amount: args.amount,
    remaining: args.amount,
    status: "active",
    source: args.source,
    sourceId: args.sourceId,
    periodKey: args.periodKey,
    expiresAt: args.expiresAt,
    grantedAt: now,
    updatedAt: now,
    metadata: args.metadata,
  });

  return { grantId, created: true, amount: args.amount, bucket: args.bucket };
}

export interface DebitCreditsArgs {
  userId: string;
  requestKey: string;
  amount: number;
  overageAllowed: boolean;
  routeId?: string;
  threadId?: string;
  messageId?: string;
  rawUsdCost?: number;
  effectiveUsdCost?: number;
  markupMultiplier?: number;
  tier?: string;
  metadata?: unknown;
}

export interface DebitCreditsResult {
  debitId: string;
  alreadyApplied: boolean;
  amount: number;
  allocatedAmount: number;
  overdraftAmount: number;
  allocations: { grantId: string; bucket: CreditBucket; amount: number }[];
  insufficientFunds: boolean;
}

/**
 * Idempotent debit. The first successful call writes a `creditDebits` row
 * keyed by `(userId, requestKey)` and consumes from grants in priority +
 * earliest-expiry order. Repeat calls with the same `requestKey` short-circuit
 * and return the original allocation.
 *
 * - If `overageAllowed` is false and the user lacks balance, we throw
 *   `INSUFFICIENT_CREDITS` and do not write a debit row.
 * - If `overageAllowed` is true, the debit always succeeds; the shortfall is
 *   recorded as `overdraftAmount`.
 */
export async function debitCreditsTx(
  ctx: LedgerMutationCtx,
  args: DebitCreditsArgs,
): Promise<DebitCreditsResult> {
  const existing = await ctx.db
    .query("creditDebits")
    .withIndex("by_user_requestKey", (q) =>
      q.eq("userId", args.userId).eq("requestKey", args.requestKey),
    )
    .first();
  if (existing) {
    const allocations = await ctx.db
      .query("creditDebitAllocations")
      .withIndex("by_debitId", (q) => q.eq("debitId", existing.debitId))
      .collect();
    return {
      debitId: existing.debitId,
      alreadyApplied: true,
      amount: existing.amount,
      allocatedAmount: existing.allocatedAmount,
      overdraftAmount: existing.overdraftAmount,
      allocations: allocations
        .flatMap((a) => {
          const bucket = normalizeGrantBucket(a.bucket);
          if (!bucket) {
            return [];
          }
          return [{ grantId: a.grantId, bucket, amount: a.amount }];
        }),
      insufficientFunds: false,
    };
  }

  const amount = Math.max(0, Math.ceil(args.amount));
  if (amount === 0) {
    const debitId = crypto.randomUUID();
    await ctx.db.insert("creditDebits", {
      debitId,
      userId: args.userId,
      requestKey: args.requestKey,
      amount: 0,
      allocatedAmount: 0,
      overdraftAmount: 0,
      overageAllowed: args.overageAllowed,
      routeId: args.routeId,
      threadId: args.threadId,
      messageId: args.messageId,
      rawUsdCost: args.rawUsdCost,
      effectiveUsdCost: args.effectiveUsdCost,
      markupMultiplier: args.markupMultiplier,
      tier: args.tier,
      metadata: args.metadata,
      createdAt: Date.now(),
    });
    return {
      debitId,
      alreadyApplied: false,
      amount: 0,
      allocatedAmount: 0,
      overdraftAmount: 0,
      allocations: [],
      insufficientFunds: false,
    };
  }

  const nowMs = Date.now();
  const eligibleGrants = await listActiveGrantsForUser(ctx, args.userId, nowMs);
  const plan = allocateDebit({ amount, grants: eligibleGrants, nowMs });

  if (plan.shortfall > 0 && !args.overageAllowed) {
    const error = new Error("INSUFFICIENT_CREDITS");
    (error as { code?: string }).code = "INSUFFICIENT_CREDITS";
    throw error;
  }

  // Apply allocations: decrement grants and write per-grant audit rows.
  const debitId = crypto.randomUUID();

  // Re-read each grant by id when patching so we operate on the latest doc.
  const allocationsToWrite: {
    grantId: string;
    bucket: CreditBucket;
    amount: number;
  }[] = [];

  for (const allocation of plan.allocations) {
    const grantRow = await ctx.db
      .query("creditGrants")
      .withIndex("by_grantId", (q) => q.eq("grantId", allocation.grantId))
      .first();
    if (!grantRow) {
      // Grant disappeared between read and apply; skip and treat as overdraft.
      continue;
    }
    const newRemaining = Math.max(0, grantRow.remaining - allocation.amount);
    await ctx.db.patch(grantRow._id, {
      remaining: newRemaining,
      status: newRemaining === 0 ? "exhausted" : grantRow.status,
      updatedAt: nowMs,
    });
    allocationsToWrite.push(allocation);
  }

  const allocatedAmount = allocationsToWrite.reduce(
    (sum, a) => sum + a.amount,
    0,
  );
  const overdraftAmount = Math.max(0, amount - allocatedAmount);

  await ctx.db.insert("creditDebits", {
    debitId,
    userId: args.userId,
    requestKey: args.requestKey,
    amount,
    allocatedAmount,
    overdraftAmount,
    overageAllowed: args.overageAllowed,
    routeId: args.routeId,
    threadId: args.threadId,
    messageId: args.messageId,
    rawUsdCost: args.rawUsdCost,
    effectiveUsdCost: args.effectiveUsdCost,
    markupMultiplier: args.markupMultiplier,
    tier: args.tier,
    metadata: args.metadata,
    createdAt: nowMs,
  });

  for (const allocation of allocationsToWrite) {
    await ctx.db.insert("creditDebitAllocations", {
      allocationId: crypto.randomUUID(),
      debitId,
      grantId: allocation.grantId,
      userId: args.userId,
      bucket: allocation.bucket,
      amount: allocation.amount,
      createdAt: nowMs,
    });
  }

  return {
    debitId,
    alreadyApplied: false,
    amount,
    allocatedAmount,
    overdraftAmount,
    allocations: allocationsToWrite,
    insufficientFunds: false,
  };
}

/**
 * Sweep expired-but-still-active grants into terminal `expired` state. Pure
 * housekeeping: balances already exclude expired rows via the query path, so
 * this only matters for clean snapshots and admin reads.
 */
export async function sweepExpiredGrantsTx(
  ctx: LedgerMutationCtx,
  userId: string,
  nowMs: number = Date.now(),
): Promise<{ expired: number }> {
  const rows = await ctx.db
    .query("creditGrants")
    .withIndex("by_user_status_expires", (q) =>
      q.eq("userId", userId).eq("status", "active"),
    )
    .collect();

  let expired = 0;
  for (const row of rows) {
    if (row.expiresAt !== undefined && row.expiresAt <= nowMs) {
      await ctx.db.patch(row._id, { status: "expired", updatedAt: nowMs });
      expired += 1;
    }
  }

  return { expired };
}

export interface RevokeSubscriptionMonthlyCreditsArgs {
  userId: string;
  subscriptionId?: string;
  reason?: string;
}

function extractSubscriptionIdFromGrantRow(row: {
  sourceId: string;
  metadata?: unknown;
}) {
  const metadataSubscriptionId =
    row.metadata &&
    typeof row.metadata === "object" &&
    typeof (row.metadata as { subscriptionId?: unknown }).subscriptionId ===
      "string"
      ? (row.metadata as { subscriptionId: string }).subscriptionId
      : undefined;

  if (metadataSubscriptionId) {
    return metadataSubscriptionId;
  }

  const [fromSourceId] = row.sourceId.split(":");
  return fromSourceId && fromSourceId.length > 0 ? fromSourceId : undefined;
}

/**
 * Revoke active recurring subscription grants, used when a paid subscription
 * is force-canceled immediately. By default it targets all active grants with
 * source `polar_subscription_renewal` for the user; when `subscriptionId` is
 * provided it narrows revocation to that subscription only.
 */
export async function revokeSubscriptionMonthlyCreditsTx(
  ctx: LedgerMutationCtx,
  args: RevokeSubscriptionMonthlyCreditsArgs,
): Promise<{ revoked: number }> {
  const nowMs = Date.now();
  const rows = await ctx.db
    .query("creditGrants")
    .withIndex("by_user_status_expires", (q) =>
      q.eq("userId", args.userId).eq("status", "active"),
    )
    .collect();

  let revoked = 0;

  for (const row of rows) {
    if (row.source !== "polar_subscription_renewal") {
      continue;
    }
    if (row.bucket !== "monthly" && row.bucket !== "free") {
      continue;
    }
    if (row.remaining <= 0) {
      continue;
    }

    const grantSubscriptionId = extractSubscriptionIdFromGrantRow(row);
    if (
      args.subscriptionId &&
      (!grantSubscriptionId || grantSubscriptionId !== args.subscriptionId)
    ) {
      continue;
    }

    const nextMetadata =
      row.metadata && typeof row.metadata === "object"
        ? {
            ...(row.metadata as Record<string, unknown>),
            revokedReason: args.reason ?? "subscription_force_canceled",
            revokedAt: nowMs,
          }
        : {
            revokedReason: args.reason ?? "subscription_force_canceled",
            revokedAt: nowMs,
          };

    await ctx.db.patch(row._id, {
      status: "revoked",
      remaining: 0,
      updatedAt: nowMs,
      metadata: nextMetadata,
    });
    revoked += 1;
  }

  return { revoked };
}

export interface RevokeFreeMonthlyCreditsArgs {
  userId: string;
  reason?: string;
}

/**
 * Revoke active grants created by the free-tier monthly reset source. This is
 * used when a user upgrades to a paid plan so free monthly allowance does not
 * stack with paid recurring credits.
 */
export async function revokeFreeMonthlyCreditsTx(
  ctx: LedgerMutationCtx,
  args: RevokeFreeMonthlyCreditsArgs,
): Promise<{ revoked: number }> {
  const nowMs = Date.now();
  const rows = await ctx.db
    .query("creditGrants")
    .withIndex("by_user_status_expires", (q) =>
      q.eq("userId", args.userId).eq("status", "active"),
    )
    .collect();

  let revoked = 0;

  for (const row of rows) {
    if (row.source !== "free_monthly_reset") {
      continue;
    }
    if (row.bucket !== "monthly" && row.bucket !== "free") {
      continue;
    }
    if (row.remaining <= 0) {
      continue;
    }

    const nextMetadata =
      row.metadata && typeof row.metadata === "object"
        ? {
            ...(row.metadata as Record<string, unknown>),
            revokedReason: args.reason ?? "upgraded_to_paid",
            revokedAt: nowMs,
          }
        : {
            revokedReason: args.reason ?? "upgraded_to_paid",
            revokedAt: nowMs,
          };

    await ctx.db.patch(row._id, {
      status: "revoked",
      remaining: 0,
      updatedAt: nowMs,
      metadata: nextMetadata,
    });
    revoked += 1;
  }

  return { revoked };
}
