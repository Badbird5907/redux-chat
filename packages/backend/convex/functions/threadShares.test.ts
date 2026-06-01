import crypto from "crypto";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const NOW = 1_700_000_000_000;
const INTERNAL_SECRET = "test-internal-secret";

const settings = {
  model: "test-model",
  tools: {},
};

function authedTest(userId = USER_ID) {
  return convexTest(schema, modules).withIdentity({ subject: userId });
}

function signedId(id: string) {
  const sig = crypto
    .createHmac("sha256", INTERNAL_SECRET)
    .update(id)
    .digest("base64");
  return `${id}:${sig}`;
}

async function seedThread(t: ReturnType<typeof authedTest>) {
  await t.run(async (ctx) => {
    await ctx.db.insert("threads", {
      threadId: "thread-1",
      userId: USER_ID,
      name: "Shared Thread",
      status: "completed",
      settings,
      selectedLeafMessageId: "a1",
      updatedAt: NOW,
    });
    await ctx.db.insert("messages", {
      threadId: "thread-1",
      messageId: "u1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
      status: "completed",
      depth: 0,
      siblingIndex: 0,
      mutation: { type: "original" },
    });
    await ctx.db.insert("messages", {
      threadId: "thread-1",
      messageId: "a1",
      parentId: "u1",
      role: "assistant",
      parts: [{ type: "text", text: "Hi" }],
      status: "completed",
      depth: 1,
      siblingIndex: 0,
      mutation: { type: "original" },
      model: "test-model",
    });
    await ctx.db.insert("messages", {
      threadId: "thread-1",
      messageId: "a2",
      parentId: "u1",
      role: "assistant",
      parts: [{ type: "text", text: "Alternate" }],
      status: "completed",
      depth: 1,
      siblingIndex: 1,
      mutation: { type: "regeneration", fromMessageId: "a1" },
      model: "test-model",
    });
    await ctx.db.insert("attachments", {
      attachmentId: "att-1",
      userId: USER_ID,
      threadId: "thread-1",
      messageId: "u1",
      status: "attached",
      projectId: "project",
      environmentId: "env",
      accessKey: "access",
      fileKeyId: "file-key",
      fileName: "note.txt",
      mimeType: "text/plain",
      size: 12,
      isPublic: true,
      serveImage: false,
      expiryStatus: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
}

describe("functions/threadShares", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CONVEX_SECRET", INTERNAL_SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("creates, lists, updates, and deletes owned share links", async () => {
    const t = authedTest();
    await seedThread(t);

    const { shareId } = await t.mutation(api.functions.threadShares.create, {
      threadId: "thread-1",
      settings: {
        onlyCurrentBranch: true,
        includeAttachments: true,
        autoUpdate: false,
      },
    });

    await expect(
      t.query(api.functions.threadShares.listForThread, {
        threadId: "thread-1",
      }),
    ).resolves.toMatchObject([
      {
        shareId,
        threadId: "thread-1",
        viewCount: 0,
        forkCount: 0,
      },
    ]);

    await t.mutation(api.functions.threadShares.update, {
      shareId,
      settings: {
        onlyCurrentBranch: false,
        includeAttachments: false,
        autoUpdate: true,
      },
    });

    const publicShare = await t.query(
      api.functions.threadShares.getPublicShare,
      { shareId },
    );
    expect(publicShare.share.settings).toEqual({
      onlyCurrentBranch: false,
      includeAttachments: false,
      autoUpdate: true,
    });
    expect(publicShare.messages.map((message) => message.messageId)).toEqual([
      "u1",
      "a1",
      "a2",
    ]);
    expect(publicShare.messages.at(0)?.attachments).toEqual([]);

    await t.mutation(api.functions.threadShares.remove, { shareId });
    await expect(
      t.query(api.functions.threadShares.getPublicShare, { shareId }),
    ).rejects.toThrow("Share not found");
  });

  it("enforces ownership and the five link limit", async () => {
    const root = convexTest(schema, modules);
    const owner = root.withIdentity({ subject: USER_ID });
    const other = root.withIdentity({ subject: OTHER_USER_ID });
    await seedThread(owner);

    for (let i = 0; i < 5; i += 1) {
      await owner.mutation(api.functions.threadShares.create, {
        threadId: "thread-1",
        settings: {
          onlyCurrentBranch: true,
          includeAttachments: true,
          autoUpdate: false,
        },
      });
    }

    await expect(
      owner.mutation(api.functions.threadShares.create, {
        threadId: "thread-1",
        settings: {
          onlyCurrentBranch: true,
          includeAttachments: true,
          autoUpdate: false,
        },
      }),
    ).rejects.toThrow("A thread can have at most 5 share links");

    await expect(
      other.query(api.functions.threadShares.listForThread, {
        threadId: "thread-1",
      }),
    ).rejects.toThrow("Thread not found");
  });

  it("freezes non-auto shares and keeps auto current-branch shares live", async () => {
    const t = authedTest();
    await seedThread(t);

    const snapshot = await t.mutation(api.functions.threadShares.create, {
      threadId: "thread-1",
      settings: {
        onlyCurrentBranch: true,
        includeAttachments: true,
        autoUpdate: false,
      },
    });
    const live = await t.mutation(api.functions.threadShares.create, {
      threadId: "thread-1",
      settings: {
        onlyCurrentBranch: true,
        includeAttachments: true,
        autoUpdate: true,
      },
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("messages", {
        threadId: "thread-1",
        messageId: "u2",
        parentId: "a1",
        role: "user",
        parts: [{ type: "text", text: "Continue" }],
        status: "completed",
        depth: 2,
        siblingIndex: 0,
        mutation: { type: "original" },
      });
    });

    await expect(
      t.query(api.functions.threadShares.getPublicShare, {
        shareId: snapshot.shareId,
      }),
    ).resolves.toMatchObject({
      messages: [{ messageId: "u1" }, { messageId: "a1" }],
    });

    await expect(
      t.query(api.functions.threadShares.getPublicShare, {
        shareId: live.shareId,
      }),
    ).resolves.toMatchObject({
      messages: [{ messageId: "u1" }, { messageId: "a1" }, { messageId: "u2" }],
    });
  });

  it("counts non-bot views and ignores bot user agents", async () => {
    const t = authedTest();
    await seedThread(t);
    const { shareId } = await t.mutation(api.functions.threadShares.create, {
      threadId: "thread-1",
      settings: {
        onlyCurrentBranch: true,
        includeAttachments: true,
        autoUpdate: false,
      },
    });

    await t.mutation(api.functions.threadShares.recordView, {
      shareId,
      userAgent: "Mozilla/5.0",
    });
    await t.mutation(api.functions.threadShares.recordView, {
      shareId,
      userAgent: "Googlebot/2.1",
    });

    await expect(
      t.query(api.functions.threadShares.getPublicShare, { shareId }),
    ).resolves.toMatchObject({
      share: { viewCount: 1 },
    });
  });

  it("forks a share into the current user's private thread", async () => {
    const root = convexTest(schema, modules);
    const owner = root.withIdentity({ subject: USER_ID });
    const viewer = root.withIdentity({ subject: OTHER_USER_ID });
    await seedThread(owner);
    const { shareId } = await owner.mutation(
      api.functions.threadShares.create,
      {
        threadId: "thread-1",
        settings: {
          onlyCurrentBranch: true,
          includeAttachments: true,
          autoUpdate: false,
        },
      },
    );

    await viewer.mutation(api.functions.threadShares.fork, {
      shareId,
      threadId: signedId("forked-thread"),
    });

    const forked = await root.run(async (ctx) =>
      ctx.db
        .query("threads")
        .withIndex("by_threadId", (q) => q.eq("threadId", "forked-thread"))
        .first(),
    );
    expect(forked?.userId).toBe(OTHER_USER_ID);

    await expect(
      owner.query(api.functions.threadShares.getPublicShare, { shareId }),
    ).resolves.toMatchObject({
      share: { forkCount: 1 },
    });
  });
});
