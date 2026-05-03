import {
  CREDIT_BUCKETS,
  type CreditBucket,
  getCreditBucketAllocationOrder,
} from "./billing";

export interface AllocatableGrant {
  grantId: string;
  bucket: CreditBucket;
  remaining: number;
  expiresAt?: number;
  grantedAt: number;
}

export interface GrantAllocation {
  grantId: string;
  bucket: CreditBucket;
  amount: number;
}

export interface AllocationResult {
  allocations: GrantAllocation[];
  allocatedAmount: number;
  shortfall: number;
}

/**
 * Pure, deterministic credit allocator.
 *
 * Given a set of active grants and a debit amount, decide how much to consume
 * from each grant. Order:
 *   1. Bucket priority (lower first; see `CREDIT_BUCKETS` ordering)
 *   2. Earliest `expiresAt` first (`undefined` = never-expires, last)
 *   3. Earliest `grantedAt` first (FIFO within a bucket)
 *   4. Lexicographic `grantId` as a final stable tiebreaker
 *
 * Grants whose `expiresAt` is <= `nowMs` are skipped.
 *
 * Returns the per-grant consumption plan, the actual allocated amount, and any
 * shortfall (>0 means insufficient funds for the requested amount).
 */
export function allocateDebit(args: {
  amount: number;
  grants: AllocatableGrant[];
  nowMs?: number;
}): AllocationResult {
  const { amount } = args;
  const nowMs = args.nowMs ?? Date.now();

  if (amount <= 0) {
    return { allocations: [], allocatedAmount: 0, shortfall: 0 };
  }

  const eligible = args.grants
    .filter((g) => g.remaining > 0 && (g.expiresAt === undefined || g.expiresAt > nowMs))
    .slice()
    .sort((a, b) => {
      const ap = CREDIT_BUCKETS[a.bucket].priority;
      const bp = CREDIT_BUCKETS[b.bucket].priority;
      if (ap !== bp) return ap - bp;

      const ae = a.expiresAt ?? Number.POSITIVE_INFINITY;
      const be = b.expiresAt ?? Number.POSITIVE_INFINITY;
      if (ae !== be) return ae - be;

      if (a.grantedAt !== b.grantedAt) return a.grantedAt - b.grantedAt;
      return a.grantId.localeCompare(b.grantId);
    });

  let remaining = amount;
  const allocations: GrantAllocation[] = [];

  for (const grant of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, grant.remaining);
    if (take <= 0) continue;
    allocations.push({
      grantId: grant.grantId,
      bucket: grant.bucket,
      amount: take,
    });
    remaining -= take;
  }

  return {
    allocations,
    allocatedAmount: amount - remaining,
    shortfall: remaining > 0 ? remaining : 0,
  };
}

/**
 * Aggregate active, unexpired grants into a per-bucket balance and overall
 * spendable total. Pure: callers pass the already-filtered active grants.
 */
export function summarizeBalances(args: {
  grants: AllocatableGrant[];
  nowMs?: number;
}): {
  spendableCredits: number;
  bucketBalances: Record<CreditBucket, number>;
} {
  const nowMs = args.nowMs ?? Date.now();
  const balances: Record<CreditBucket, number> = {
    gifted: 0,
    monthly: 0,
    paid: 0,
  };

  for (const grant of args.grants) {
    if (grant.remaining <= 0) continue;
    if (grant.expiresAt !== undefined && grant.expiresAt <= nowMs) continue;
    balances[grant.bucket] += grant.remaining;
  }

  const spendableCredits = balances.gifted + balances.monthly + balances.paid;

  return { spendableCredits, bucketBalances: balances };
}

export { getCreditBucketAllocationOrder };
