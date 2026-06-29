import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";

function authedTest(userId = USER_ID) {
  return convexTest(schema, modules).withIdentity({ subject: userId });
}

describe("functions/chatScrollPreferences", () => {
  it("returns null when no preferences are stored", async () => {
    const t = authedTest();

    const stored = await t.query(api.functions.chatScrollPreferences.get, {});

    expect(stored).toBeNull();
  });

  it("upserts a patch over the defaults", async () => {
    const t = authedTest();

    const updated = await t.mutation(
      api.functions.chatScrollPreferences.update,
      { patch: { openPosition: "end" } },
    );

    expect(updated).toEqual({
      autoScroll: true,
      openPosition: "end",
      keepPreviousVisible: true,
    });

    const stored = await t.query(api.functions.chatScrollPreferences.get, {});
    expect(stored).toEqual(updated);
  });

  it("merges successive patches and shares the userSettings row", async () => {
    const t = authedTest();

    await t.mutation(api.functions.chatScrollPreferences.update, {
      patch: { autoScroll: false },
    });
    const merged = await t.mutation(
      api.functions.chatScrollPreferences.update,
      { patch: { keepPreviousVisible: false } },
    );

    expect(merged).toEqual({
      autoScroll: false,
      openPosition: "last-anchor",
      keepPreviousVisible: false,
    });

    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("userSettings")
        .withIndex("by_userId", (q) => q.eq("userId", USER_ID))
        .collect(),
    );
    expect(rows).toHaveLength(1);
  });

  it("does not clobber unrelated userSettings fields", async () => {
    const t = authedTest();

    await t.run(async (ctx) => {
      await ctx.db.insert("userSettings", {
        userId: USER_ID,
        mcpServersEnabled: false,
        updatedAt: 1,
      });
    });

    await t.mutation(api.functions.chatScrollPreferences.update, {
      patch: { openPosition: "start" },
    });

    const row = await t.run(async (ctx) =>
      ctx.db
        .query("userSettings")
        .withIndex("by_userId", (q) => q.eq("userId", USER_ID))
        .first(),
    );

    expect(row?.mcpServersEnabled).toBe(false);
    expect(row?.chatScroll?.openPosition).toBe("start");
  });

  it("clears stored preferences on reset", async () => {
    const t = authedTest();

    await t.mutation(api.functions.chatScrollPreferences.update, {
      patch: { autoScroll: false },
    });
    await t.mutation(api.functions.chatScrollPreferences.reset, {});

    const stored = await t.query(api.functions.chatScrollPreferences.get, {});
    expect(stored).toBeNull();
  });
});
