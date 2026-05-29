import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { DEFAULT_IMAGE_GENERATION_MODEL_ID } from "@redux/shared/models";
import { getEnabledToolSettings } from "@redux/types";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";

function authedTest(userId = USER_ID) {
  return convexTest(schema, modules).withIdentity({ subject: userId });
}

describe("functions/defaultMessageSettings", () => {
  it("preserves legacy disabled tools while defaulting new tools on", async () => {
    const t = authedTest();

    await t.run(async (ctx) => {
      await ctx.db.insert("defaultMessageSettings", {
        userId: USER_ID,
        settings: { model: "openai/gpt-5", tools: {} },
        updatedAt: 1,
      });
    });

    const settings = await t.mutation(
      api.functions.defaultMessageSettings.getOrCreate,
      {},
    );

    expect(settings.tools.search).toBe(false);
    expect(settings.tools.bashWorkspace).toBe(false);
    expect(settings.tools.analysisWorkspace).toBe(false);
    expect(settings.tools.mcpServers).toEqual({ serverIds: [] });
    expect(settings.tools.imageGeneration).toEqual({
      modelId: DEFAULT_IMAGE_GENERATION_MODEL_ID,
    });

    const stored = await t.run(async (ctx) =>
      ctx.db
        .query("defaultMessageSettings")
        .withIndex("by_userId", (q) => q.eq("userId", USER_ID))
        .first(),
    );

    expect(stored?.settings.tools).toEqual(settings.tools);
  });

  it("uses false for disabled tools and null to restore enabled defaults", async () => {
    const t = authedTest();

    const disabled = await t.mutation(
      api.functions.defaultMessageSettings.update,
      {
        patch: {
          tools: {
            search: false,
            imageGeneration: false,
          },
        },
      },
    );

    expect(disabled.tools.search).toBe(false);
    expect(disabled.tools.imageGeneration).toBe(false);

    const restored = await t.mutation(
      api.functions.defaultMessageSettings.update,
      {
        patch: {
          tools: {
            imageGeneration: null,
          },
        },
      },
    );

    expect(restored.tools.search).toBe(false);
    expect(
      getEnabledToolSettings(restored.tools, "imageGeneration")?.modelId,
    ).toBe(DEFAULT_IMAGE_GENERATION_MODEL_ID);
  });
});
