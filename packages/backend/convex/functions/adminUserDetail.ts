import { ConvexError, v } from "convex/values";

import { components } from "../_generated/api";
import { authComponent } from "../auth";
import { getDenormalizedUsageStats } from "../usageStats";
import { mutation, query } from "./index";

function rolesFromAuthRoleField(role: string | null | undefined): string[] {
  if (role == null || role === "") {
    return ["user"];
  }
  return role
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

async function ensureAdmin(
  ctx: Parameters<typeof authComponent.getAuthUser>[0],
) {
  const me = await authComponent.getAuthUser(ctx);
  const roleField = (me as { role?: string | null }).role;
  const roles = rolesFromAuthRoleField(roleField);
  if (!roles.includes("admin")) {
    throw new ConvexError("Forbidden");
  }
}

export const getUsageStatsForUser = query({
  args: {
    targetUserId: v.string(),
  },
  handler: async (ctx, { targetUserId }) => {
    await ensureAdmin(ctx);

    return await getDenormalizedUsageStats(ctx, targetUserId);
  },
});

export const listLinkedAccountsForUser = query({
  args: {
    targetUserId: v.string(),
  },
  handler: async (ctx, { targetUserId }) => {
    await ensureAdmin(ctx);

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

export const unlinkLinkedAccountForUser = mutation({
  args: {
    targetUserId: v.string(),
    providerId: v.string(),
    externalAccountId: v.string(),
  },
  handler: async (ctx, { targetUserId, providerId, externalAccountId }) => {
    await ensureAdmin(ctx);

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
