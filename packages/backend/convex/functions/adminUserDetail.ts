import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import { components } from "../_generated/api";
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
      value: string | number | Array<string>;
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
