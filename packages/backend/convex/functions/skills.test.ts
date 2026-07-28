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

async function insertSkill(
  t: ReturnType<typeof authedTest>,
  input: {
    skillId: string;
    userId?: string;
    slug: string;
    enabled?: boolean;
    allowAutoLoad?: boolean;
  },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("skills", {
      skillId: input.skillId,
      userId: input.userId ?? USER_ID,
      name: `Skill ${input.skillId}`,
      description: "A reusable skill",
      slug: input.slug,
      enabled: input.enabled ?? true,
      allowAutoLoad: input.allowAutoLoad ?? false,
      sourceType: "upload",
      entrypointText: "# Skill",
      metadataWasInferred: false,
      fileCount: 0,
      totalBytes: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
}

describe("functions/skills", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists only the current user's skills", async () => {
    const t = authedTest();
    await insertSkill(t, { skillId: "mine", slug: "mine" });
    await insertSkill(t, {
      skillId: "other",
      userId: OTHER_USER_ID,
      slug: "other",
    });

    await expect(t.query(api.functions.skills.list, {})).resolves.toEqual([
      expect.objectContaining({ skillId: "mine", slug: "mine" }),
    ]);
  });

  it("updates activation scope and defaults to thread", async () => {
    const t = authedTest();
    await expect(
      t.query(api.functions.skills.getActivationScope, {}),
    ).resolves.toBe("thread");

    await expect(
      t.mutation(api.functions.skills.updateActivationScope, {
        scope: "message",
      }),
    ).resolves.toBe("message");

    await expect(
      t.query(api.functions.skills.getActivationScope, {}),
    ).resolves.toBe("message");
  });

  it("enforces unique slash commands when metadata changes", async () => {
    const t = authedTest();
    await insertSkill(t, { skillId: "one", slug: "one" });
    await insertSkill(t, { skillId: "two", slug: "two" });

    await expect(
      t.mutation(api.functions.skills.updateMetadata, {
        skillId: "two",
        name: "Two",
        description: "Updated description",
        slug: "one",
      }),
    ).rejects.toThrow("already in use");
  });

  it("hides disabled skills from active thread results without deleting the association", async () => {
    const t = authedTest();
    await insertSkill(t, { skillId: "writer", slug: "writer" });
    await t.run(async (ctx) => {
      await ctx.db.insert("threads", {
        threadId: "thread-1",
        userId: USER_ID,
        name: "Thread",
        status: "completed",
        settings: { model: "openai/gpt-5", tools: {} },
        updatedAt: NOW,
      });
      await ctx.db.insert("threadSkills", {
        userId: USER_ID,
        threadId: "thread-1",
        skillId: "writer",
        activatedAt: NOW,
      });
    });

    await expect(
      t.query(api.functions.skills.listThreadActive, { threadId: "thread-1" }),
    ).resolves.toHaveLength(1);

    await t.mutation(api.functions.skills.setEnabled, {
      skillId: "writer",
      enabled: false,
    });
    await expect(
      t.query(api.functions.skills.listThreadActive, { threadId: "thread-1" }),
    ).resolves.toEqual([]);

    const association = await t.run((ctx) =>
      ctx.db
        .query("threadSkills")
        .withIndex("by_userId_threadId_skillId", (q) =>
          q
            .eq("userId", USER_ID)
            .eq("threadId", "thread-1")
            .eq("skillId", "writer"),
        )
        .first(),
    );
    expect(association).not.toBeNull();
  });

  it("deletes active thread associations with the skill", async () => {
    const t = authedTest();
    await insertSkill(t, { skillId: "writer", slug: "writer" });
    await t.run(async (ctx) => {
      await ctx.db.insert("threadSkills", {
        userId: USER_ID,
        threadId: "thread-1",
        skillId: "writer",
        activatedAt: NOW,
      });
    });

    await expect(
      t.mutation(api.functions.skills.deleteSkill, { skillId: "writer" }),
    ).resolves.toEqual({ success: true });

    const associations = await t.run((ctx) =>
      ctx.db
        .query("threadSkills")
        .withIndex("by_skillId", (q) => q.eq("skillId", "writer"))
        .collect(),
    );
    expect(associations).toEqual([]);
  });

  it("removes expired model-created skill proposals", async () => {
    const t = authedTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("skillProposals", {
        proposalId: "expired",
        userId: USER_ID,
        threadId: "thread-1",
        messageId: "message-1",
        toolCallId: "tool-call-1",
        name: "Expired proposal",
        description: "Temporary",
        files: [
          {
            path: "SKILL.md",
            content: "# Expired",
            size: 9,
            lineCount: 1,
          },
        ],
        status: "pending",
        expiresAt: NOW - 1,
        createdAt: NOW - 1_000,
        updatedAt: NOW - 1_000,
      });
    });

    await expect(
      t.mutation(
        internal.functions.skills.internal_cleanupExpiredProposals,
        {},
      ),
    ).resolves.toEqual({ deleted: 1 });

    const proposals = await t.run((ctx) =>
      ctx.db.query("skillProposals").collect(),
    );
    expect(proposals).toEqual([]);
  });
});
