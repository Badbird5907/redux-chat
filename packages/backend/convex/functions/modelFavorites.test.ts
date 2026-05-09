import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultFavorites } from "@redux/shared/models";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";

function authedTest() {
  return convexTest(schema, modules).withIdentity({ subject: USER_ID });
}

describe("functions/modelFavorites", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists defaults before the user customizes favorites", async () => {
    const t = authedTest();

    await expect(t.query(api.functions.modelFavorites.list)).resolves.toEqual(
      defaultFavorites,
    );
  });

  it("removing an implicit default initializes favorites without that model", async () => {
    const t = authedTest();
    const removedModelId = defaultFavorites[0];

    await t.mutation(api.functions.modelFavorites.setFavorite, {
      modelId: removedModelId,
      favorited: false,
    });

    await expect(t.query(api.functions.modelFavorites.list)).resolves.toEqual(
      defaultFavorites.filter((modelId) => modelId !== removedModelId),
    );
  });

  it("trims, deduplicates, and caps replaceAll input", async () => {
    const t = authedTest();
    const modelIds = [
      " custom/model-a ",
      "custom/model-a",
      "",
      ...Array.from({ length: 60 }, (_, index) => `custom/model-${index}`),
    ];

    await expect(
      t.mutation(api.functions.modelFavorites.replaceAll, { modelIds }),
    ).resolves.toHaveLength(50);

    const favorites = await t.query(api.functions.modelFavorites.list);
    expect(favorites).toHaveLength(50);
    expect(favorites[0]).toBe("custom/model-a");
    expect(new Set(favorites).size).toBe(favorites.length);
  });

  it("rejects reorder lists that omit an existing favorite", async () => {
    const t = authedTest();

    await t.mutation(api.functions.modelFavorites.replaceAll, {
      modelIds: ["model-a", "model-b"],
    });

    await expect(
      t.mutation(api.functions.modelFavorites.reorder, {
        modelIds: ["model-b"],
      }),
    ).rejects.toThrow("Reorder list must contain all favorite models");
  });
});
