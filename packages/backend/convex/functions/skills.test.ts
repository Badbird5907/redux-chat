import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const NOW = 1_700_000_000_000;
const INTERNAL_SECRET = "test-internal-secret";

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
      entrypointBytes: 7,
      metadataWasInferred: false,
      fileCount: 0,
      totalBytes: 0,
      storageBytes: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("skillEntrypoints", {
      skillId: input.skillId,
      userId: input.userId ?? USER_ID,
      text: "# Skill",
      size: 7,
      sha256: "entrypoint-sha",
      createdAt: NOW,
      updatedAt: NOW,
    });
    await ctx.db.insert("skillManifests", {
      skillId: input.skillId,
      userId: input.userId ?? USER_ID,
      files: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });
}

describe("functions/skills", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CONVEX_SECRET", INTERNAL_SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("returns only enabled automatic skills from the catalog", async () => {
    const t = authedTest();
    await insertSkill(t, {
      skillId: "automatic",
      slug: "automatic",
      allowAutoLoad: true,
    });
    await insertSkill(t, {
      skillId: "manual",
      slug: "manual",
      allowAutoLoad: false,
    });
    await insertSkill(t, {
      skillId: "disabled",
      slug: "disabled",
      allowAutoLoad: true,
      enabled: false,
    });

    await expect(
      t.query(api.functions.skills.backend_getAutoSkillCatalog, {
        secret: INTERNAL_SECRET,
        userId: USER_ID,
      }),
    ).resolves.toEqual([expect.objectContaining({ skillId: "automatic" })]);
  });

  it("loads runtime content from the entrypoint and public manifest", async () => {
    const t = authedTest();
    await insertSkill(t, { skillId: "writer", slug: "writer" });
    await expect(
      t.query(api.functions.skills.backend_getSkillForRuntime, {
        secret: INTERNAL_SECRET,
        userId: USER_ID,
        skillId: "writer",
      }),
    ).resolves.toMatchObject({
      skillId: "writer",
      entrypointText: "# Skill",
      entrypointBytes: 7,
      files: [],
    });
  });

  it("returns message triggers before deduplicated thread activations", async () => {
    const t = authedTest();
    await insertSkill(t, { skillId: "one", slug: "one" });
    await insertSkill(t, { skillId: "two", slug: "two" });
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
        skillId: "one",
        activatedAt: NOW,
      });
      await ctx.db.insert("threadSkills", {
        userId: USER_ID,
        threadId: "thread-1",
        skillId: "two",
        activatedAt: NOW - 1,
      });
      await ctx.db.insert("skillUsages", {
        userId: USER_ID,
        threadId: "thread-1",
        userMessageId: "user-1",
        assistantMessageId: "assistant-1",
        skillId: "one",
        skillName: "One",
        skillSlug: "one",
        trigger: "slash-message",
        createdAt: NOW,
      });
    });
    await expect(
      t.query(api.functions.skills.backend_getSelectedSkillRefs, {
        secret: INTERNAL_SECRET,
        userId: USER_ID,
        threadId: "thread-1",
        assistantMessageId: "assistant-1",
      }),
    ).resolves.toEqual([
      { skillId: "one", trigger: "slash-message" },
      { skillId: "two", trigger: "slash-thread" },
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

  it("claims proposal approval atomically before finalizing", async () => {
    const t = authedTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("skillProposals", {
        proposalId: "proposal-1",
        userId: USER_ID,
        threadId: "thread-1",
        messageId: "message-1",
        toolCallId: "tool-call-1",
        name: "Proposed skill",
        description: "Temporary",
        files: [
          {
            path: "SKILL.md",
            size: 10,
            lineCount: 1,
          },
        ],
        status: "pending",
        expiresAt: NOW + 60_000,
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("skillProposalPayloads", {
        proposalId: "proposal-1",
        userId: USER_ID,
        threadId: "thread-1",
        files: [
          {
            path: "SKILL.md",
            content: "# Proposed",
            size: 10,
            lineCount: 1,
          },
        ],
        expiresAt: NOW + 60_000,
        createdAt: NOW,
      });
    });

    await expect(
      t.mutation(api.functions.skills.backend_claimProposalApproval, {
        secret: INTERNAL_SECRET,
        userId: USER_ID,
        proposalId: "proposal-1",
        claimId: "claim-1",
      }),
    ).resolves.toEqual(expect.objectContaining({ state: "claimed" }));
    await expect(
      t.mutation(api.functions.skills.backend_claimProposalApproval, {
        secret: INTERNAL_SECRET,
        userId: USER_ID,
        proposalId: "proposal-1",
        claimId: "claim-2",
      }),
    ).resolves.toEqual({ state: "in_progress" });
    await expect(
      t.mutation(api.functions.skills.backend_finalizeProposalApproval, {
        secret: INTERNAL_SECRET,
        userId: USER_ID,
        proposalId: "proposal-1",
        claimId: "claim-2",
        skillId: "skill-1",
      }),
    ).rejects.toThrow("claim was lost");
    await expect(
      t.mutation(api.functions.skills.backend_finalizeProposalApproval, {
        secret: INTERNAL_SECRET,
        userId: USER_ID,
        proposalId: "proposal-1",
        claimId: "claim-1",
        skillId: "skill-1",
      }),
    ).resolves.toEqual({ skillId: "skill-1" });
    const payload = await t.run((ctx) =>
      ctx.db
        .query("skillProposalPayloads")
        .withIndex("by_proposalId", (q) => q.eq("proposalId", "proposal-1"))
        .first(),
    );
    expect(payload).toBeNull();
  });

  it("tombstones expired proposals while preserving terminal and live records", async () => {
    const t = authedTest();
    await t.run(async (ctx) => {
      for (const [proposalId, status, expiresAt] of [
        ["expired", "pending", NOW - 1],
        ["approved", "approved", NOW - 1],
        ["rejected", "rejected", NOW - 1],
        ["live", "pending", NOW + 1],
      ] as const) {
        await ctx.db.insert("skillProposals", {
          proposalId,
          userId: USER_ID,
          threadId: "thread-1",
          messageId: `message-${proposalId}`,
          toolCallId: `tool-call-${proposalId}`,
          name: `${proposalId} proposal`,
          description: "Temporary",
          files: [
            {
              path: "SKILL.md",
              size: proposalId.length + 2,
              lineCount: 1,
            },
          ],
          status,
          approvedSkillId: status === "approved" ? "skill-1" : undefined,
          expiresAt,
          createdAt: NOW - 1_000,
          updatedAt: NOW - 1_000,
        });
        await ctx.db.insert("skillProposalPayloads", {
          proposalId,
          userId: USER_ID,
          threadId: "thread-1",
          files: [
            {
              path: "SKILL.md",
              content: `# ${proposalId}`,
              size: proposalId.length + 2,
              lineCount: 1,
            },
          ],
          expiresAt,
          createdAt: NOW - 1_000,
        });
      }
    });

    await expect(
      t.mutation(
        internal.functions.skills.internal_cleanupExpiredProposals,
        {},
      ),
    ).resolves.toEqual({ cleaned: 3 });

    const proposals = await t.run((ctx) =>
      ctx.db.query("skillProposals").collect(),
    );
    expect(proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          proposalId: "expired",
          status: "expired",
        }),
        expect.objectContaining({
          proposalId: "approved",
          status: "approved",
          approvedSkillId: "skill-1",
        }),
        expect.objectContaining({
          proposalId: "rejected",
          status: "rejected",
        }),
        expect.objectContaining({
          proposalId: "live",
          status: "pending",
        }),
      ]),
    );
    const payloads = await t.run((ctx) =>
      ctx.db.query("skillProposalPayloads").collect(),
    );
    expect(payloads).toEqual([expect.objectContaining({ proposalId: "live" })]);
    await expect(
      t.mutation(
        internal.functions.skills.internal_cleanupExpiredProposals,
        {},
      ),
    ).resolves.toEqual({ cleaned: 0 });
  });
});
