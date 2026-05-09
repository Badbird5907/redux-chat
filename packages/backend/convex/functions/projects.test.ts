import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const OTHER_USER_ID = "user-2";
const NOW = 1_700_000_000_000;

function authedTest(userId = USER_ID) {
  return convexTest(schema, modules).withIdentity({ subject: userId });
}

describe("functions/projects", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates projects with normalized optional text", async () => {
    const t = authedTest();

    const { projectId } = await t.mutation(
      api.functions.projects.createProject,
      {
        name: "  Research Workspace  ",
        description: "   ",
        instructions: "  Prefer short answers.  ",
      },
    );

    await expect(
      t.query(api.functions.projects.getProject, { projectId }),
    ).resolves.toEqual({
      projectId,
      name: "Research Workspace",
      description: undefined,
      instructions: "Prefer short answers.",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("rejects empty names on create and update", async () => {
    const t = authedTest();

    await expect(
      t.mutation(api.functions.projects.createProject, {
        name: "   ",
      }),
    ).rejects.toThrow("Project name cannot be empty");

    const { projectId } = await t.mutation(
      api.functions.projects.createProject,
      {
        name: "Project",
      },
    );

    await expect(
      t.mutation(api.functions.projects.updateProject, {
        projectId,
        patch: { name: "  " },
      }),
    ).rejects.toThrow("Project name cannot be empty");
  });

  it("keeps project access scoped to the owning user", async () => {
    const root = convexTest(schema, modules);
    const owner = root.withIdentity({ subject: USER_ID });
    const { projectId } = await owner.mutation(
      api.functions.projects.createProject,
      {
        name: "Private Project",
      },
    );

    const otherUser = root.withIdentity({
      subject: OTHER_USER_ID,
    });

    await expect(
      otherUser.query(api.functions.projects.getProject, { projectId }),
    ).rejects.toThrow("Project not found");

    await expect(
      otherUser.mutation(api.functions.projects.updateProject, {
        projectId,
        patch: { name: "Nope" },
      }),
    ).rejects.toThrow("Project not found");
  });

  it("searches projects by name and description for the owning user", async () => {
    const root = convexTest(schema, modules);
    const owner = root.withIdentity({ subject: USER_ID });
    const otherUser = root.withIdentity({ subject: OTHER_USER_ID });

    await owner.run(async (ctx) => {
      await ctx.db.insert("projects", {
        projectId: "alpha",
        userId: USER_ID,
        name: "Alpha Workspace",
        description: "Planning and notes",
        createdAt: NOW,
        updatedAt: NOW,
      });
      await ctx.db.insert("projects", {
        projectId: "research",
        userId: USER_ID,
        name: "Research",
        description: "Alpha experiments",
        createdAt: NOW + 1,
        updatedAt: NOW + 1,
      });
      await ctx.db.insert("projects", {
        projectId: "other-user-alpha",
        userId: OTHER_USER_ID,
        name: "Alpha Private",
        createdAt: NOW + 2,
        updatedAt: NOW + 2,
      });
    });

    await expect(
      owner.query(api.functions.projects.searchProjects, {
        search: "alpha",
        limit: 10,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        projectId: "research",
        name: "Research",
      }),
      expect.objectContaining({
        projectId: "alpha",
        name: "Alpha Workspace",
      }),
    ]);

    await expect(
      otherUser.query(api.functions.projects.searchProjects, {
        search: "alpha",
        limit: 10,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        projectId: "other-user-alpha",
        name: "Alpha Private",
      }),
    ]);
  });

  it("lists only project threads for the requested project", async () => {
    const t = authedTest();

    await t.run(async (ctx) => {
      await ctx.db.insert("threads", {
        threadId: "project-thread",
        userId: USER_ID,
        name: "Project Thread",
        status: "completed",
        settings: { model: "openai/gpt-5", tools: {} },
        chatProjectId: "project-1",
        updatedAt: NOW,
      });
      await ctx.db.insert("threads", {
        threadId: "other-project-thread",
        userId: USER_ID,
        name: "Other Project Thread",
        status: "completed",
        settings: { model: "openai/gpt-5", tools: {} },
        chatProjectId: "project-2",
        updatedAt: NOW + 1,
      });
      await ctx.db.insert("threads", {
        threadId: "global-thread",
        userId: USER_ID,
        name: "Global Thread",
        status: "completed",
        settings: { model: "openai/gpt-5", tools: {} },
        updatedAt: NOW + 2,
      });
    });

    const result = await t.query(api.functions.projects.getProjectThreads, {
      projectId: "project-1",
      paginationOpts: { numItems: 10, cursor: null },
    });

    expect(result.page).toEqual([
      expect.objectContaining({
        threadId: "project-thread",
        name: "Project Thread",
      }),
    ]);
  });
});
