import { describe, expect, it } from "vitest";

import {
  type AllocatableGrant,
  allocateDebit,
  summarizeBalances,
} from "./credit-allocation";

const NOW = 1_700_000_000_000;
const ONE_DAY = 86_400_000;

function grant(overrides: Partial<AllocatableGrant>): AllocatableGrant {
  return {
    grantId: overrides.grantId ?? "g1",
    bucket: overrides.bucket ?? "monthly",
    remaining: overrides.remaining ?? 100,
    expiresAt: overrides.expiresAt,
    grantedAt: overrides.grantedAt ?? NOW - ONE_DAY,
  };
}

describe("allocateDebit", () => {
  it("returns nothing when amount is zero or negative", () => {
    const result = allocateDebit({
      amount: 0,
      grants: [grant({})],
      nowMs: NOW,
    });
    expect(result).toEqual({ allocations: [], allocatedAmount: 0, shortfall: 0 });
  });

  it("consumes buckets in priority order: gifted → monthly → paid", () => {
    const grants: AllocatableGrant[] = [
      grant({ grantId: "paid1", bucket: "paid", remaining: 100 }),
      grant({ grantId: "month1", bucket: "monthly", remaining: 100 }),
      grant({ grantId: "month2", bucket: "monthly", remaining: 100 }),
      grant({ grantId: "gift1", bucket: "gifted", remaining: 100 }),
    ];

    const result = allocateDebit({ amount: 250, grants, nowMs: NOW });

    expect(result.allocations).toEqual([
      { grantId: "gift1", bucket: "gifted", amount: 100 },
      { grantId: "month1", bucket: "monthly", amount: 100 },
      { grantId: "month2", bucket: "monthly", amount: 50 },
    ]);
    expect(result.allocatedAmount).toBe(250);
    expect(result.shortfall).toBe(0);
  });

  it("skips expired grants and prefers earliest-expiring eligible first", () => {
    const grants: AllocatableGrant[] = [
      grant({ grantId: "expired", bucket: "monthly", remaining: 100, expiresAt: NOW - 1 }),
      grant({ grantId: "neverExpires", bucket: "monthly", remaining: 100 }),
      grant({ grantId: "expiresLater", bucket: "monthly", remaining: 100, expiresAt: NOW + 30 * ONE_DAY }),
      grant({ grantId: "expiresSooner", bucket: "monthly", remaining: 100, expiresAt: NOW + ONE_DAY }),
    ];

    const result = allocateDebit({ amount: 150, grants, nowMs: NOW });

    expect(result.allocations.map((a) => a.grantId)).toEqual([
      "expiresSooner",
      "expiresLater",
    ]);
    expect(result.allocations[0]?.amount).toBe(100);
    expect(result.allocations[1]?.amount).toBe(50);
  });

  it("reports shortfall when amount exceeds total spendable", () => {
    const grants: AllocatableGrant[] = [
      grant({ grantId: "g1", bucket: "monthly", remaining: 50 }),
      grant({ grantId: "g2", bucket: "paid", remaining: 30 }),
    ];

    const result = allocateDebit({ amount: 200, grants, nowMs: NOW });

    expect(result.allocatedAmount).toBe(80);
    expect(result.shortfall).toBe(120);
    expect(result.allocations).toHaveLength(2);
  });

  it("breaks ties within a bucket by grantedAt FIFO then grantId", () => {
    const grants: AllocatableGrant[] = [
      grant({ grantId: "b", bucket: "monthly", remaining: 10, grantedAt: NOW - 2 * ONE_DAY }),
      grant({ grantId: "a", bucket: "monthly", remaining: 10, grantedAt: NOW - 2 * ONE_DAY }),
      grant({ grantId: "c", bucket: "monthly", remaining: 10, grantedAt: NOW - 3 * ONE_DAY }),
    ];

    const result = allocateDebit({ amount: 25, grants, nowMs: NOW });

    expect(result.allocations.map((a) => a.grantId)).toEqual(["c", "a", "b"]);
  });

  it("ignores grants with zero remaining", () => {
    const grants: AllocatableGrant[] = [
      grant({ grantId: "empty", bucket: "gifted", remaining: 0 }),
      grant({ grantId: "ok", bucket: "monthly", remaining: 50 }),
    ];

    const result = allocateDebit({ amount: 30, grants, nowMs: NOW });
    expect(result.allocations).toEqual([
      { grantId: "ok", bucket: "monthly", amount: 30 },
    ]);
  });
});

describe("summarizeBalances", () => {
  it("aggregates active unexpired grants by bucket", () => {
    const grants: AllocatableGrant[] = [
      grant({ grantId: "g1", bucket: "gifted", remaining: 50 }),
      grant({ grantId: "g2", bucket: "monthly", remaining: 100 }),
      grant({ grantId: "g3", bucket: "monthly", remaining: 25 }),
      grant({ grantId: "expired", bucket: "monthly", remaining: 999, expiresAt: NOW - 1 }),
      grant({ grantId: "empty", bucket: "paid", remaining: 0 }),
    ];

    const result = summarizeBalances({ grants, nowMs: NOW });

    expect(result.bucketBalances).toEqual({
      gifted: 50,
      monthly: 125,
      paid: 0,
    });
    expect(result.spendableCredits).toBe(175);
  });
});
