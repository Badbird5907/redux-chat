import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";

function authedTest(userId = USER_ID) {
  return convexTest(schema, modules).withIdentity({ subject: userId });
}

describe("threads", () => {
  it("deletes generated and skill records with the thread", async () => {
    const t = authedTest();

    await t.run(async (ctx) => {
      await ctx.db.insert("threads", {
        threadId: "thread-1",
        userId: USER_ID,
        name: "Image Thread",
        status: "completed",
        settings: { model: "openai/gpt-image-2", tools: {} },
        selectedLeafMessageId: "assistant-1",
        updatedAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        threadId: "thread-1",
        messageId: "assistant-1",
        role: "assistant",
        parts: [],
        status: "completed",
        depth: 1,
        siblingIndex: 0,
        mutation: { type: "original" },
      });
      await ctx.db.insert("generatedImages", {
        generatedImageId: "generated-1",
        userId: USER_ID,
        threadId: "thread-1",
        messageId: "assistant-1",
        modelId: "openai/gpt-image-2",
        provider: "openai",
        source: "image_generation",
        prompt: "A test image",
        mimeType: "image/png",
        size: 123,
        projectId: "project-1",
        environmentId: "environment-1",
        accessKey: "access-key",
        fileKeyId: "file-key",
        fileName: "generated.png",
        createdAt: Date.now(),
      });
      await ctx.db.insert("threadSkills", {
        userId: USER_ID,
        threadId: "thread-1",
        skillId: "skill-1",
        activatedAt: Date.now(),
      });
      await ctx.db.insert("skillUsages", {
        userId: USER_ID,
        threadId: "thread-1",
        userMessageId: "user-1",
        assistantMessageId: "assistant-1",
        skillId: "skill-1",
        skillName: "Skill",
        skillSlug: "skill",
        trigger: "slash-thread",
        createdAt: Date.now(),
      });
      await ctx.db.insert("skillProposals", {
        proposalId: "proposal-1",
        userId: USER_ID,
        threadId: "thread-1",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        name: "Proposed skill",
        description: "Temporary",
        files: [],
        status: "pending",
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("skillProposalPayloads", {
        proposalId: "proposal-1",
        userId: USER_ID,
        threadId: "thread-1",
        files: [],
        expiresAt: Date.now() + 60_000,
        createdAt: Date.now(),
      });
    });

    await t.mutation(api.functions.threads.deleteThread, {
      threadId: "thread-1",
    });

    const remaining = await t.run(async (ctx) => ({
      generatedImages: await ctx.db.query("generatedImages").collect(),
      threadSkills: await ctx.db.query("threadSkills").collect(),
      skillUsages: await ctx.db.query("skillUsages").collect(),
      skillProposals: await ctx.db.query("skillProposals").collect(),
      skillProposalPayloads: await ctx.db
        .query("skillProposalPayloads")
        .collect(),
    }));
    expect(remaining).toEqual({
      generatedImages: [],
      threadSkills: [],
      skillUsages: [],
      skillProposals: [],
      skillProposalPayloads: [],
    });
  });
});
