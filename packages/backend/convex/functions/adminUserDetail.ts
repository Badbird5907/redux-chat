import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { UserBillingState } from "@redux/shared";
import { getPlanConfig } from "@redux/shared";

import { components } from "../_generated/api";
import {
  getBillingConfig,
  getUtcMonthBounds,
  resolveTierFromSubscription,
  toSubscriptionSnapshot,
} from "../billing";
import {
  getCreditBalanceForUser,
  grantCreditsTx,
  revokeCreditGrantForUserTx,
} from "../credits";
import { backendEnv } from "../env";
import { polar } from "../polar";
import { getDenormalizedUsageStats } from "../usageStats";
import { adminMutation, adminQuery } from "./index";

export const listAuditLogsForUser = adminQuery({
  args: {
    targetUserId: v.string(),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
    status: v.optional(v.union(v.literal("success"), v.literal("failed"))),
    severity: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high"),
        v.literal("critical"),
      ),
    ),
    actions: v.optional(v.array(v.string())),
    ipAddresses: v.optional(v.array(v.string())),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (
    ctx,
    {
      targetUserId,
      paginationOpts,
      from,
      to,
      status,
      severity,
      actions,
      ipAddresses,
    },
  ) => {
    const where: {
      field: string;
      operator?: "eq" | "gte" | "lte" | "in";
      value: string | number | string[];
    }[] = [{ field: "userId", operator: "eq", value: targetUserId }];
    if (from !== undefined) {
      where.push({ field: "createdAt", operator: "gte", value: from });
    }
    if (to !== undefined) {
      where.push({ field: "createdAt", operator: "lte", value: to });
    }
    if (status !== undefined) {
      where.push({ field: "status", operator: "eq", value: status });
    }
    if (severity !== undefined) {
      where.push({ field: "severity", operator: "eq", value: severity });
    }
    if (actions !== undefined && actions.length > 0) {
      where.push({ field: "action", operator: "in", value: actions });
    }
    if (ipAddresses !== undefined && ipAddresses.length > 0) {
      where.push({ field: "ipAddress", operator: "in", value: ipAddresses });
    }

    return (await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "auditLog",
      paginationOpts,
      where,
      sortBy: { field: "createdAt", direction: "desc" },
    })) as {
      page: {
        _id: string;
        action: string;
        status: string;
        severity: string;
        ipAddress?: string | null;
        createdAt: number;
      }[];
      isDone: boolean;
      continueCursor: string;
    };
  },
});

export const listAuditLogFacetsForUser = adminQuery({
  args: {
    targetUserId: v.string(),
  },
  handler: async (ctx, { targetUserId }) => {
    const FACET_SCAN_LIMIT = 1000;
    const result = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "auditLog",
      paginationOpts: { numItems: FACET_SCAN_LIMIT, cursor: null },
      where: [{ field: "userId", operator: "eq", value: targetUserId }],
      sortBy: { field: "createdAt", direction: "desc" },
    })) as {
      page: { action: string; ipAddress?: string | null }[];
    };

    const actions = new Set<string>();
    const ipAddresses = new Set<string>();
    for (const row of result.page) {
      if (typeof row.action === "string" && row.action.length > 0) {
        actions.add(row.action);
      }
      if (typeof row.ipAddress === "string" && row.ipAddress.length > 0) {
        ipAddresses.add(row.ipAddress);
      }
    }
    return {
      actions: Array.from(actions).sort(),
      ipAddresses: Array.from(ipAddresses).sort(),
    };
  },
});

export const getUsageStatsForUser = adminQuery({
  args: {
    targetUserId: v.string(),
  },
  handler: async (ctx, { targetUserId }) => {
    return await getDenormalizedUsageStats(ctx, targetUserId);
  },
});

export const listLinkedAccountsForUser = adminQuery({
  args: {
    targetUserId: v.string(),
  },
  handler: async (ctx, { targetUserId }) => {
    const paginated: unknown = await ctx.runQuery(
      components.betterAuth.adapter.findMany,
      {
        model: "account",
        paginationOpts: { numItems: 100, cursor: null },
        where: [{ field: "userId", operator: "eq", value: targetUserId }],
        sortBy: { field: "createdAt", direction: "desc" },
      },
    );

    type AccountRow = {
      providerId: string;
      accountId: string;
      createdAt: number;
      updatedAt: number;
      scope?: string | null;
      password?: string | null;
    };

    type MappedAccount = {
      providerId: string;
      externalAccountId: string;
      createdAt: number;
      updatedAt: number;
      scope: string | null;
      hasCredentialPassword: boolean;
    };

    const rawResult = paginated as unknown[] | { page?: unknown[] };
    const maybeRows = Array.isArray(rawResult) ? rawResult : rawResult.page;
    const rows = Array.isArray(maybeRows) ? maybeRows : [];
    const mapped: MappedAccount[] = [];
    for (const rowUnknown of rows) {
      const row = rowUnknown as AccountRow;
      if (
        typeof row.providerId !== "string" ||
        typeof row.accountId !== "string" ||
        typeof row.createdAt !== "number" ||
        typeof row.updatedAt !== "number"
      ) {
        continue;
      }
      const scope = typeof row.scope === "string" ? row.scope : null;
      mapped.push({
        providerId: row.providerId,
        externalAccountId: row.accountId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        scope,
        hasCredentialPassword:
          typeof row.password === "string" && row.password.length > 0,
      });
    }
    return mapped;
  },
});

export const listGrantsForUser = adminQuery({
  args: {
    targetUserId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { targetUserId, paginationOpts }) => {
    return await ctx.db
      .query("creditGrants")
      .withIndex("by_user_granted_at", (q) => q.eq("userId", targetUserId))
      .order("desc")
      .paginate(paginationOpts);
  },
});

export const getBillingStateForUser = adminQuery({
  args: {
    targetUserId: v.string(),
  },
  handler: async (ctx, { targetUserId }) => {
    const polarCustomer = await polar.getCustomerByUserId(ctx, targetUserId);
    const subscription = toSubscriptionSnapshot(
      await polar.getCurrentSubscription(ctx, { userId: targetUserId }),
    );
    const tier = resolveTierFromSubscription(subscription);
    const plan = getPlanConfig(tier, getBillingConfig());
    const freePeriodBounds = tier === "free" ? getUtcMonthBounds() : undefined;
    const balance = await getCreditBalanceForUser(ctx, targetUserId);

    const env = backendEnv();
    const baseUrl =
      env.POLAR_SERVER === "sandbox"
        ? "https://sandbox.polar.sh"
        : "https://polar.sh";

    return {
      tier,
      spendableCredits: balance.spendableCredits,
      bucketBalances: balance.bucketBalances,
      expiringSoon: balance.expiringSoon,
      markupMultiplier: plan.markupMultiplier,
      includedMonthlyCredits: plan.includedMonthlyCredits,
      overageAllowed: plan.overageAllowed,
      currentPeriodStart:
        subscription?.currentPeriodStart ?? freePeriodBounds?.start,
      currentPeriodEnd: subscription?.currentPeriodEnd ?? freePeriodBounds?.end,
      url: polarCustomer
        ? `${baseUrl}/dashboard/redux/customers/${polarCustomer.id}`
        : undefined,
    } satisfies UserBillingState;
  },
});

export const adminGrantCreditsForUser = adminMutation({
  args: {
    targetUserId: v.string(),
    bucket: v.union(
      v.literal("gifted"),
      v.literal("monthly"),
      v.literal("paid"),
    ),
    amount: v.number(),
    note: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, { targetUserId, bucket, amount, note, expiresAt }) => {
    if (amount <= 0) {
      throw new ConvexError("Amount must be positive");
    }
    if (expiresAt !== undefined && expiresAt <= Date.now()) {
      throw new ConvexError("Expiry must be in the future");
    }
    return await grantCreditsTx(ctx, {
      userId: targetUserId,
      bucket,
      amount,
      source: "admin_grant",
      sourceId: `admin:${crypto.randomUUID()}`,
      metadata: note ? { note } : undefined,
      expiresAt,
    });
  },
});

export const adminRevokeCreditGrantForUser = adminMutation({
  args: {
    targetUserId: v.string(),
    grantId: v.string(),
  },
  handler: async (ctx, { targetUserId, grantId }) => {
    await revokeCreditGrantForUserTx(ctx, {
      userId: targetUserId,
      grantId,
    });
    return null;
  },
});

export const unlinkLinkedAccountForUser = adminMutation({
  args: {
    targetUserId: v.string(),
    providerId: v.string(),
    externalAccountId: v.string(),
  },
  handler: async (ctx, { targetUserId, providerId, externalAccountId }) => {
    const paginated: unknown = await ctx.runQuery(
      components.betterAuth.adapter.findMany,
      {
        model: "account",
        paginationOpts: { numItems: 100, cursor: null },
        where: [{ field: "userId", operator: "eq", value: targetUserId }],
      },
    );

    type AccountRow = { accountId: string; providerId: string };
    const rawResult = paginated as unknown[] | { page?: unknown[] };
    const maybeRows = Array.isArray(rawResult) ? rawResult : rawResult.page;
    const rows = Array.isArray(maybeRows) ? maybeRows : [];
    const typed: AccountRow[] = [];
    for (const rowUnknown of rows) {
      const row = rowUnknown as AccountRow;
      if (
        typeof row.accountId === "string" &&
        typeof row.providerId === "string"
      ) {
        typed.push({ accountId: row.accountId, providerId: row.providerId });
      }
    }

    if (typed.length <= 1) {
      throw new ConvexError(
        "Cannot unlink the user's only linked sign-in account.",
      );
    }

    const match = typed.find(
      (r) => r.providerId === providerId && r.accountId === externalAccountId,
    );
    if (match === undefined) {
      throw new ConvexError("Account not found");
    }

    await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: "account",
        where: [
          { field: "userId", operator: "eq", value: targetUserId },
          { field: "providerId", operator: "eq", value: providerId },
          { field: "accountId", operator: "eq", value: externalAccountId },
        ],
      },
    });

    return null;
  },
});
