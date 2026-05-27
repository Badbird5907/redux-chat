import type { GenericMutationCtx, GenericQueryCtx } from "convex/server";

import type { DataModel, Doc } from "./_generated/dataModel";

type UsageStatsCtx = GenericMutationCtx<DataModel> | GenericQueryCtx<DataModel>;

type UsageStatsPatch = {
  userMessagesDelta?: number;
  threadsDelta?: number;
  attachmentsDelta?: number;
  storageBytesDelta?: number;
  lastActiveAt?: number;
};

export function usageStatsDayKey(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function usageStatsStartDayKey(days: number, now = Date.now()): string {
  return usageStatsDayKey(now - (days - 1) * 24 * 60 * 60 * 1000);
}

function clampCount(value: number): number {
  return Math.max(0, value);
}

async function getUsageStatsRow(ctx: UsageStatsCtx, userId: string) {
  return await ctx.db
    .query("userUsageStats")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

function applyUsagePatch(
  existing: Doc<"userUsageStats"> | null,
  patch: UsageStatsPatch,
  now: number,
) {
  const lastActiveAt =
    patch.lastActiveAt === undefined
      ? existing?.lastActiveAt
      : Math.max(existing?.lastActiveAt ?? 0, patch.lastActiveAt);

  return {
    userMessageCount: clampCount(
      (existing?.userMessageCount ?? 0) + (patch.userMessagesDelta ?? 0),
    ),
    threadCount: clampCount(
      (existing?.threadCount ?? 0) + (patch.threadsDelta ?? 0),
    ),
    attachmentCount: clampCount(
      (existing?.attachmentCount ?? 0) + (patch.attachmentsDelta ?? 0),
    ),
    storageBytes: clampCount(
      (existing?.storageBytes ?? 0) + (patch.storageBytesDelta ?? 0),
    ),
    lastActiveAt,
    updatedAt: now,
  };
}

export async function updateUserUsageStats(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  patch: UsageStatsPatch,
) {
  const now = Date.now();
  const existing = await getUsageStatsRow(ctx, userId);
  const next = applyUsagePatch(existing, patch, now);

  if (existing === null) {
    await ctx.db.insert("userUsageStats", {
      userId,
      ...next,
      createdAt: now,
    });
    return;
  }

  await ctx.db.patch(existing._id, next);
}

export async function incrementDailyAssistantApiCalls(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
  timestamp = Date.now(),
) {
  const now = Date.now();
  const dayKey = usageStatsDayKey(timestamp);
  const existing = await ctx.db
    .query("userDailyUsageStats")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", userId).eq("dayKey", dayKey),
    )
    .first();

  if (existing === null) {
    await ctx.db.insert("userDailyUsageStats", {
      userId,
      dayKey,
      assistantApiCalls: 1,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    assistantApiCalls: existing.assistantApiCalls + 1,
    updatedAt: now,
  });
}

export async function getDenormalizedUsageStats(
  ctx: GenericQueryCtx<DataModel>,
  userId: string,
) {
  const totals = await getUsageStatsRow(ctx, userId);
  const startDayKey = usageStatsStartDayKey(30);
  const dailyRows = await ctx.db
    .query("userDailyUsageStats")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", userId).gte("dayKey", startDayKey),
    )
    .collect();

  return {
    totalMessages: totals?.userMessageCount ?? 0,
    threadsCreated: totals?.threadCount ?? 0,
    attachmentsUploaded: totals?.attachmentCount ?? 0,
    storageBytes: totals?.storageBytes ?? 0,
    chatApiCalls30d: dailyRows.reduce(
      (total, row) => total + row.assistantApiCalls,
      0,
    ),
    lastActiveAt: totals?.lastActiveAt ?? null,
  };
}
