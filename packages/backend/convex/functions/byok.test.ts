import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_MODEL_ROUTING_CONFIG } from "@redux/shared/models";

import { api } from "../_generated/api";
import schema from "../schema";
import { modules } from "../test.setup";

const USER_ID = "user-1";
const SECRET = "test-internal-secret";

function byokTest() {
  return convexTest(schema, modules).withIdentity({ subject: USER_ID });
}

function credentialArgs(
  overrides: Partial<{
    provider: "openai" | "openrouter";
    ciphertext: string;
    displaySuffix: string;
    connectionType: "api_key" | "chatgpt_oauth" | "openrouter_oauth";
    displayLabel: string;
    availableModelIds: string[];
    supportsImageGeneration: boolean;
  }> = {},
) {
  return {
    secret: SECRET,
    userId: USER_ID,
    provider: "openai" as const,
    ciphertext: "ciphertext-1",
    iv: "iv",
    authTag: "auth-tag",
    keyVersion: 1,
    displaySuffix: "1234",
    connectionType: "api_key" as const,
    ...overrides,
  };
}

describe("functions/byok", () => {
  beforeEach(() => {
    vi.stubEnv("INTERNAL_CONVEX_SECRET", SECRET);
    vi.useFakeTimers();
    vi.setSystemTime(1_700_000_000_000);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("reports legacy rows as revision 1 API-key connections without secrets", async () => {
    const t = byokTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("providerCredentials", {
        userId: USER_ID,
        provider: "openai",
        ciphertext: "legacy-ciphertext",
        iv: "legacy-iv",
        authTag: "legacy-tag",
        keyVersion: 1,
        displaySuffix: "cret",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    const summary = await t.query(api.functions.byok.getSettingsSummary, {});
    expect(summary.credentials).toEqual([
      {
        provider: "openai",
        displaySuffix: "cret",
        connectionType: "api_key",
        displayLabel: undefined,
        availableModelIds: undefined,
        supportsImageGeneration: false,
        revision: 1,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
      },
    ]);
    expect(summary.credentials[0]).not.toHaveProperty("ciphertext");
    expect(summary.credentials[0]).not.toHaveProperty("iv");
    expect(summary.credentials[0]).not.toHaveProperty("authTag");
  });

  it("keeps one provider row and increments revisions on every replacement", async () => {
    const t = byokTest();
    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs(),
    );
    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs({
        ciphertext: "chatgpt-ciphertext",
        connectionType: "chatgpt_oauth",
        displayLabel: "person@example.com",
        availableModelIds: ["gpt-5.5"],
        supportsImageGeneration: true,
      }),
    );

    const rows = await t.run((ctx) =>
      ctx.db
        .query("providerCredentials")
        .withIndex("by_userId_provider", (q) =>
          q.eq("userId", USER_ID).eq("provider", "openai"),
        )
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ciphertext: "chatgpt-ciphertext",
      connectionType: "chatgpt_oauth",
      revision: 2,
    });
  });

  it("treats a legacy row as revision 1 when replacing it", async () => {
    const t = byokTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("providerCredentials", {
        userId: USER_ID,
        provider: "openai",
        ciphertext: "legacy",
        iv: "iv",
        authTag: "tag",
        keyVersion: 1,
        displaySuffix: "gacy",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });

    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs({ ciphertext: "replacement" }),
    );
    const stored = await t.query(
      api.functions.byok.internal_getEncryptedCredential,
      { secret: SECRET, userId: USER_ID, provider: "openai" },
    );
    expect(stored).toMatchObject({ ciphertext: "replacement", revision: 2 });
  });

  it("removes OAuth-only metadata when replacing a connection with an API key", async () => {
    const t = byokTest();
    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs({
        connectionType: "chatgpt_oauth",
        displayLabel: "person@example.com",
        availableModelIds: ["gpt-5.5"],
        supportsImageGeneration: true,
      }),
    );
    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs({ ciphertext: "manual-key" }),
    );

    const row = await t.run((ctx) =>
      ctx.db
        .query("providerCredentials")
        .withIndex("by_userId_provider", (q) =>
          q.eq("userId", USER_ID).eq("provider", "openai"),
        )
        .unique(),
    );
    expect(row).toMatchObject({
      ciphertext: "manual-key",
      connectionType: "api_key",
      revision: 2,
    });
    expect(row).not.toHaveProperty("displayLabel");
    expect(row).not.toHaveProperty("availableModelIds");
    expect(row).not.toHaveProperty("supportsImageGeneration");
  });

  it("prevents stale refresh writes and invalid-token deletes", async () => {
    const t = byokTest();
    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs({
        ciphertext: "oauth-v1",
        connectionType: "chatgpt_oauth",
        availableModelIds: ["gpt-5.5"],
        supportsImageGeneration: true,
      }),
    );
    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs({ ciphertext: "new-manual-key" }),
    );

    await expect(
      t.mutation(api.functions.byok.internal_replaceCredentialIfRevision, {
        ...credentialArgs({
          ciphertext: "stale-refresh",
          connectionType: "chatgpt_oauth",
          availableModelIds: ["gpt-5.5"],
          supportsImageGeneration: true,
        }),
        expectedRevision: 1,
      }),
    ).resolves.toEqual({ updated: false, revision: 2 });
    await expect(
      t.mutation(api.functions.byok.internal_deleteCredentialIfRevision, {
        secret: SECRET,
        userId: USER_ID,
        provider: "openai",
        expectedRevision: 1,
      }),
    ).resolves.toEqual({ deleted: false });

    const stored = await t.query(
      api.functions.byok.internal_getEncryptedCredential,
      { secret: SECRET, userId: USER_ID, provider: "openai" },
    );
    expect(stored).toMatchObject({
      ciphertext: "new-manual-key",
      connectionType: "api_key",
      revision: 2,
    });
  });

  it("removes overrides that a route-limited ChatGPT connection cannot serve", async () => {
    const t = byokTest();
    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs(),
    );
    await t.mutation(api.functions.byok.internal_updateRouting, {
      secret: SECRET,
      userId: USER_ID,
      preset: DEFAULT_MODEL_ROUTING_CONFIG.preset,
      providerPriority: DEFAULT_MODEL_ROUTING_CONFIG.providerPriority,
      hostedFallback: DEFAULT_MODEL_ROUTING_CONFIG.hostedFallback,
      overrides: [
        {
          modelId: "openai/gpt-5.6-sol",
          kind: "byok",
          routeId: "openai:gpt-5.6-sol",
        },
      ],
    });
    await t.mutation(
      api.functions.byok.internal_upsertCredential,
      credentialArgs({
        connectionType: "chatgpt_oauth",
        availableModelIds: ["gpt-5.5"],
        supportsImageGeneration: true,
      }),
    );

    const summary = await t.query(api.functions.byok.getSettingsSummary, {});
    expect(summary.routing.overrides).toEqual([]);
  });
});
