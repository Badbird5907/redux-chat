import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const INTERNAL_SECRET = "test-internal-secret";

describe("functions/migrations", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CONVEX_SECRET", INTERNAL_SECRET);
    vi.stubEnv("SITE_URL", "");
    vi.stubEnv("AUTH_SECRET", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns defaults when secret is valid", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(
      api.functions.migrations.getLegacyMessageSettingsCounts,
      {
        secret: INTERNAL_SECRET,
      },
    );

    expect(result).toMatchObject({
      threads: 0,
      defaultMessageSettings: 0,
      threadsWithLegacyToolsArray: 0,
    });
  });

  it("throws for an invalid internal secret", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.query(api.functions.migrations.getLegacyMessageSettingsCounts, {
        secret: "invalid-secret",
      }),
    ).rejects.toThrowError("Invalid secret");
  });
});
