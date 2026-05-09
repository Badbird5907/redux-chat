import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getDenormalizedUsageStats,
  incrementDailyAssistantApiCalls,
  updateUserUsageStats,
  usageStatsDayKey,
  usageStatsStartDayKey,
} from "./usageStats";
import schema from "./schema";
import { modules } from "./test.setup";

const USER_ID = "user-1";
const NOW = Date.UTC(2026, 4, 8, 12);

describe("usageStats helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats UTC day keys and rolling window start keys", () => {
    expect(usageStatsDayKey(Date.UTC(2026, 0, 2, 3))).toBe("2026-01-02");
    expect(usageStatsStartDayKey(30, Date.UTC(2026, 4, 8, 12))).toBe(
      "2026-04-09",
    );
  });

  it("creates and updates denormalized totals without going negative", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await updateUserUsageStats(ctx, USER_ID, {
        userMessagesDelta: 3,
        threadsDelta: 2,
        attachmentsDelta: 1,
        storageBytesDelta: 1024,
        lastActiveAt: NOW - 1000,
      });
      await updateUserUsageStats(ctx, USER_ID, {
        userMessagesDelta: -10,
        threadsDelta: -1,
        attachmentsDelta: -10,
        storageBytesDelta: -2048,
        lastActiveAt: NOW - 2000,
      });
    });

    const stats = await t.run(async (ctx) =>
      getDenormalizedUsageStats(ctx, USER_ID),
    );

    expect(stats).toMatchObject({
      totalMessages: 0,
      threadsCreated: 1,
      attachmentsUploaded: 0,
      storageBytes: 0,
      lastActiveAt: NOW - 1000,
    });
  });

  it("increments daily assistant API calls and only counts the last 30 days", async () => {
    const t = convexTest(schema, modules);

    await t.run(async (ctx) => {
      await incrementDailyAssistantApiCalls(ctx, USER_ID, NOW);
      await incrementDailyAssistantApiCalls(ctx, USER_ID, NOW);
      await incrementDailyAssistantApiCalls(
        ctx,
        USER_ID,
        NOW - 29 * 24 * 60 * 60 * 1000,
      );
      await incrementDailyAssistantApiCalls(
        ctx,
        USER_ID,
        NOW - 30 * 24 * 60 * 60 * 1000,
      );
    });

    const stats = await t.run(async (ctx) =>
      getDenormalizedUsageStats(ctx, USER_ID),
    );

    expect(stats.chatApiCalls30d).toBe(3);
  });
});
