import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const NOW = 1_700_000_000_000;

function authedTest(userId = USER_ID) {
  return convexTest(schema, modules).withIdentity({ subject: userId });
}

async function insertAttachment(
  t: ReturnType<typeof authedTest>,
  args: {
    attachmentId: string;
    userId?: string;
    expiresAt?: number;
    expiryStatus?: "active" | "expired";
    createdAt?: number;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("attachments", {
      attachmentId: args.attachmentId,
      userId: args.userId ?? USER_ID,
      status: "attached",
      projectId: "project",
      environmentId: "env",
      accessKey: `access-${args.attachmentId}`,
      fileKeyId: `file-${args.attachmentId}`,
      fileName: `${args.attachmentId}.txt`,
      mimeType: "text/plain",
      size: 12,
      isPublic: true,
      serveImage: false,
      expiresAt: args.expiresAt,
      expiryStatus: args.expiryStatus,
      createdAt: args.createdAt ?? NOW,
      updatedAt: args.createdAt ?? NOW,
    });
  });
}

describe("functions/attachments", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists only active settings attachments in newest-first order", async () => {
    const t = authedTest();
    await insertAttachment(t, {
      attachmentId: "active",
      expiresAt: NOW + 60_000,
      expiryStatus: "active",
      createdAt: NOW + 1,
    });
    await insertAttachment(t, {
      attachmentId: "expired",
      expiresAt: NOW - 60_000,
      expiryStatus: "expired",
      createdAt: NOW + 3,
    });
    await insertAttachment(t, {
      attachmentId: "permanent",
      expiryStatus: "active",
      createdAt: NOW + 2,
    });
    await insertAttachment(t, {
      attachmentId: "other-user",
      userId: OTHER_USER_ID,
      expiryStatus: "active",
      createdAt: NOW + 4,
    });

    const result = await t.query(api.functions.attachments.listForSettings, {
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page.map((attachment) => attachment.attachmentId)).toEqual([
      "permanent",
      "active",
    ]);
    expect(result.page.every((attachment) => attachment.expired === false)).toBe(
      true,
    );
  });

  it("sweeps expired active attachments without changing unexpired files", async () => {
    const t = authedTest();
    await insertAttachment(t, {
      attachmentId: "expired-active",
      expiresAt: NOW - 1,
      expiryStatus: "active",
    });
    await insertAttachment(t, {
      attachmentId: "unexpired-active",
      expiresAt: NOW + 1,
      expiryStatus: "active",
    });
    await insertAttachment(t, {
      attachmentId: "permanent-active",
      expiryStatus: "active",
    });
    await insertAttachment(t, {
      attachmentId: "already-expired",
      expiresAt: NOW - 1,
      expiryStatus: "expired",
    });

    await t.mutation(
      internal.functions.attachments.internal_sweepExpiredAttachments,
      {},
    );

    const attachments = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("attachments")
        .withIndex("by_userId", (q) => q.eq("userId", USER_ID))
        .collect();
      return Object.fromEntries(
        rows.map((attachment) => [
          attachment.attachmentId,
          attachment.expiryStatus,
        ]),
      );
    });

    expect(attachments).toMatchObject({
      "expired-active": "expired",
      "unexpired-active": "active",
      "permanent-active": "active",
      "already-expired": "expired",
    });
  });
});
