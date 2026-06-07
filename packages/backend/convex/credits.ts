import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";
import { ConvexError } from "convex/values";

import type {
  AllocatableGrant,
  CreditBalance,
  CreditBucket,
  CreditGrantSource,
} from "@redux/shared";
import {
  allocateDebit,
  CREDIT_BUCKETS,
  DEFAULT_BILLING_CONFIG,
  getPlanConfig,
  summarizeBalances,
} from "@redux/shared";

import type { DataModel } from "./_generated/dataModel";

export type LedgerQueryCtx = GenericQueryCtx<DataModel>;
export type LedgerMutationCtx = GenericMutationCtx<DataModel>;

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
    .flatMap((g) => {
      const exp = g.expiresAt;
      if (exp === undefined || exp <= nowMs || exp > expiringWindowMs) {
        return [];
      }
      return [
        {
          bucket: g.bucket,
          grantId: g.grantId,
          remaining: g.remaining,
          expiresAt: exp,
        },
      ];
    })
    .sort((a, b) => a.expiresAt - b.expiresAt);

  return {
    spendableCredits: summary.spendableCredits,
    bucketBalances: summary.bucketBalances,
    expiringSoon,
  };
}

export function sortCreditGrantHistory<
  T extends { grantId: string; grantedAt: number; status: string },
>(grants: T[]): T[] {
  return [...grants].sort((a, b) => {
    const aActive = a.status === "active";
    const bActive = b.status === "active";
    if (aActive !== bActive) return aActive ? -1 : 1;
    if (a.grantedAt !== b.grantedAt) return b.grantedAt - a.grantedAt;
    return a.grantId.localeCompare(b.grantId);
  });
}

export function paginateSortedCreditGrantHistory<T>(
  grants: T[],
  paginationOpts: { cursor: string | null; numItems: number },
) {
  const start = paginationOpts.cursor ? Number(paginationOpts.cursor) : 0;
  const safeStart = Number.isInteger(start) && start >= 0 ? start : 0;
  const page = grants.slice(safeStart, safeStart + paginationOpts.numItems);
  const next = safeStart + page.length;

  return {
    page,
    isDone: next >= grants.length,
    continueCursor: String(next),
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

export interface UpsertSubscriptionMonthlyCreditsArgs {
  userId: string;
  amount: number;
  sourceId: string;
  periodKey?: string;
  expiresAt?: number;
  metadata?: unknown;
}

export type UpsertSubscriptionMonthlyCreditsResult = GrantCreditsResult & {
  adjusted: boolean;
  previousAmount?: number;
  previousRemaining?: number;
};

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

/**
 * Subscription allowances are idempotent by subscription period, but the plan
 * amount can change inside the same period (Plus -> Pro). In that case, keep
 * the consumed credits consumed and adjust the active lot to the new allowance.
 */
export async function upsertSubscriptionMonthlyCreditsTx(
  ctx: LedgerMutationCtx,
  args: UpsertSubscriptionMonthlyCreditsArgs,
): Promise<UpsertSubscriptionMonthlyCreditsResult> {
  if (args.amount <= 0) {
    throw new Error("Grant amount must be positive");
  }

  const existing = await ctx.db
    .query("creditGrants")
    .withIndex("by_source_sourceId", (q) =>
      q
        .eq("source", "stripe_subscription_renewal")
        .eq("sourceId", args.sourceId),
    )
    .first();

  if (!existing) {
    const created = await grantCreditsTx(ctx, {
      userId: args.userId,
      bucket: "monthly",
      amount: args.amount,
      source: "stripe_subscription_renewal",
      sourceId: args.sourceId,
      periodKey: args.periodKey,
      expiresAt: args.expiresAt,
      metadata: args.metadata,
    });
    return { ...created, adjusted: false };
  }

  const existingBucket = normalizeGrantBucket(existing.bucket) ?? "monthly";
  if (existing.userId !== args.userId || existingBucket !== "monthly") {
    return {
      grantId: existing.grantId,
      created: false,
      adjusted: false,
      amount: existing.amount,
      bucket: existingBucket,
    };
  }

  const consumed = Math.max(0, existing.amount - existing.remaining);
  const nextRemaining = Math.max(0, args.amount - consumed);
  const shouldAdjust =
    existing.amount !== args.amount ||
    existing.remaining !== nextRemaining ||
    existing.status !== "active" ||
    existing.bucket !== "monthly" ||
    existing.periodKey !== args.periodKey ||
    existing.expiresAt !== args.expiresAt;

  if (!shouldAdjust) {
    return {
      grantId: existing.grantId,
      created: false,
      adjusted: false,
      amount: existing.amount,
      bucket: existingBucket,
    };
  }

  const metadata =
    existing.metadata && typeof existing.metadata === "object"
      ? (existing.metadata as Record<string, unknown>)
      : {};

  await ctx.db.patch(existing._id, {
    amount: args.amount,
    remaining: nextRemaining,
    status: nextRemaining > 0 ? "active" : "exhausted",
    bucket: "monthly",
    periodKey: args.periodKey,
    expiresAt: args.expiresAt,
    updatedAt: Date.now(),
    metadata: {
      ...metadata,
      ...(args.metadata && typeof args.metadata === "object"
        ? (args.metadata as Record<string, unknown>)
        : {}),
      adjustedFromAmount: existing.amount,
      adjustedFromRemaining: existing.remaining,
      adjustedAt: Date.now(),
    },
  });

  return {
    grantId: existing.grantId,
    created: false,
    adjusted: true,
    amount: args.amount,
    bucket: "monthly",
    previousAmount: existing.amount,
    previousRemaining: existing.remaining,
  };
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
 * When the user lacks sufficient balance the debit drains whatever remains
 * (the shortfall is recorded as `overdraftAmount`) and returns with
 * `insufficientFunds: true`. This ensures generations are never completely
 * free even when the balance cannot cover the full charge.
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
      allocations: allocations.flatMap((a) => {
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
    // Drain whatever balance remains instead of rejecting the debit entirely.
    // The shortfall is recorded as overdraft so we have an audit trail, but the
    // user's available credits are zeroed out and the generation is not free.
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
    insufficientFunds: plan.shortfall > 0,
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
 * source `stripe_subscription_renewal` for the user; when `subscriptionId` is
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
    if (row.source !== "stripe_subscription_renewal") {
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

export type EnsureFreeMonthlyCreditsAfterPaidCancellationResult = {
  grantId: string;
  created: boolean;
  reactivated: boolean;
  amount: number;
  bucket: CreditBucket;
};

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
            remainingAtRevocation: row.remaining,
            revokedReason: args.reason ?? "upgraded_to_paid",
            revokedAt: nowMs,
          }
        : {
            remainingAtRevocation: row.remaining,
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

export async function ensureFreeMonthlyCreditsAfterPaidCancellationTx(
  ctx: LedgerMutationCtx,
  args: { userId: string; reason?: string },
): Promise<EnsureFreeMonthlyCreditsAfterPaidCancellationResult> {
  const nowMs = Date.now();
  const periodKey = getMonthlyPeriodKey(nowMs);
  const sourceId = `${args.userId}:${periodKey}`;
  const expiresAt = getMonthlyExpiresAt(nowMs);
  const plan = getPlanConfig("free", DEFAULT_BILLING_CONFIG);

  const existingRows = await ctx.db
    .query("creditGrants")
    .withIndex("by_source_sourceId", (q) =>
      q.eq("source", "free_monthly_reset").eq("sourceId", sourceId),
    )
    .collect();

  const active = existingRows.find(
    (row) =>
      row.userId === args.userId &&
      row.status === "active" &&
      row.remaining > 0 &&
      (row.expiresAt === undefined || row.expiresAt > nowMs),
  );
  if (active) {
    return {
      grantId: active.grantId,
      created: false,
      reactivated: false,
      amount: active.amount,
      bucket: normalizeGrantBucket(active.bucket) ?? "monthly",
    };
  }

  const revoked = existingRows.find(
    (row) =>
      row.userId === args.userId &&
      row.status === "revoked" &&
      (row.bucket === "monthly" || row.bucket === "free"),
  );
  if (revoked) {
    const metadata =
      revoked.metadata && typeof revoked.metadata === "object"
        ? (revoked.metadata as Record<string, unknown>)
        : {};
    const remainingAtRevocation = metadata.remainingAtRevocation;
    const restoredRemaining =
      typeof remainingAtRevocation === "number" &&
      Number.isFinite(remainingAtRevocation) &&
      remainingAtRevocation > 0
        ? remainingAtRevocation
        : revoked.amount;

    const currentIncludedMonthlyCredits = plan.includedMonthlyCredits;
    const restoredAmount = Math.min(
      currentIncludedMonthlyCredits,
      restoredRemaining,
    );

    await ctx.db.patch(revoked._id, {
      status: "active",
      amount: currentIncludedMonthlyCredits,
      remaining: restoredAmount,
      bucket: "monthly",
      periodKey,
      expiresAt,
      updatedAt: nowMs,
      metadata: {
        ...metadata,
        reactivatedReason: args.reason ?? "paid_subscription_canceled",
        reactivatedAt: nowMs,
      },
    });

    return {
      grantId: revoked.grantId,
      created: false,
      reactivated: true,
      amount: currentIncludedMonthlyCredits,
      bucket: "monthly",
    };
  }

  const created = await grantCreditsTx(ctx, {
    userId: args.userId,
    bucket: "monthly",
    amount: plan.includedMonthlyCredits,
    source: "free_monthly_reset",
    sourceId,
    periodKey,
    expiresAt,
    metadata: {
      reason: args.reason ?? "paid_subscription_canceled",
    },
  });

  return { ...created, reactivated: false };
}

export interface RevokeCreditGrantForUserArgs {
  userId: string;
  grantId: string;
  reason?: string;
}

/**
 * Revoke a single grant by `grantId` for a user. Only `active` rows are
 * patched to `revoked` (remaining zeroed) so exhausted / expired / revoked
 * grants are rejected.
 */
export async function revokeCreditGrantForUserTx(
  ctx: LedgerMutationCtx,
  args: RevokeCreditGrantForUserArgs,
): Promise<void> {
  const row = await ctx.db
    .query("creditGrants")
    .withIndex("by_grantId", (q) => q.eq("grantId", args.grantId))
    .unique();

  if (!row) {
    throw new ConvexError("Grant not found");
  }
  if (row.userId !== args.userId) {
    throw new ConvexError("Grant does not belong to this user");
  }
  if (row.status !== "active") {
    throw new ConvexError("Only active grants can be revoked");
  }

  const nowMs = Date.now();
  const revokedReason = args.reason ?? "admin_revoke";
  const nextMetadata =
    row.metadata && typeof row.metadata === "object"
      ? {
          ...(row.metadata as Record<string, unknown>),
          revokedReason,
          revokedAt: nowMs,
        }
      : {
          revokedReason,
          revokedAt: nowMs,
        };

  await ctx.db.patch(row._id, {
    status: "revoked",
    remaining: 0,
    updatedAt: nowMs,
    metadata: nextMetadata,
  });
}
