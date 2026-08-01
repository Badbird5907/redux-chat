import { v } from "convex/values";

import type {
  ByokProviderId,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import {
  BYOK_PROVIDER_IDS,
  DEFAULT_MODEL_ROUTING_CONFIG,
  getModelRoute,
  isByokProviderId,
  sanitizeModelRoutingConfig,
} from "@redux/shared/models";

import {
  byokProviderValidator,
  modelRoutingOverrideValidator,
} from "../byokValidators";
import { backendMutation, backendQuery, query } from "./index";

const routingArgs = {
  preset: v.union(
    v.literal("native_first"),
    v.literal("openrouter_first"),
    v.literal("custom"),
  ),
  providerPriority: v.array(byokProviderValidator),
  hostedFallback: v.boolean(),
  overrides: v.array(modelRoutingOverrideValidator),
};

export const getSettingsSummary = query({
  args: {},
  handler: async (ctx) => {
    const [credentials, routing] = await Promise.all([
      ctx.db
        .query("providerCredentials")
        .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", ctx.userId))
        .collect(),
      ctx.db
        .query("userModelRouting")
        .withIndex("by_userId", (q) => q.eq("userId", ctx.userId))
        .unique(),
    ]);
    const availableProviders = new Set(
      credentials.map((credential) => credential.provider),
    );
    const config = filterRoutingForProviders(
      sanitizeModelRoutingConfig(routing),
      availableProviders,
    );

    return {
      credentials: credentials
        .map((credential) => ({
          provider: credential.provider,
          displaySuffix: credential.displaySuffix,
          createdAt: credential.createdAt,
          updatedAt: credential.updatedAt,
        }))
        .sort((a, b) => a.provider.localeCompare(b.provider)),
      routing: config,
    };
  },
});

export const internal_getEncryptedBundle = backendQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const [credentials, routing] = await Promise.all([
      ctx.db
        .query("providerCredentials")
        .withIndex("by_userId_and_updatedAt", (q) =>
          q.eq("userId", args.userId),
        )
        .collect(),
      ctx.db
        .query("userModelRouting")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
    ]);
    return {
      credentials: credentials.map((credential) => ({
        provider: credential.provider,
        ciphertext: credential.ciphertext,
        iv: credential.iv,
        authTag: credential.authTag,
        keyVersion: credential.keyVersion,
      })),
      routing: filterRoutingForProviders(
        sanitizeModelRoutingConfig(routing),
        new Set(credentials.map((credential) => credential.provider)),
      ),
    };
  },
});

export const internal_upsertCredential = backendMutation({
  args: {
    userId: v.string(),
    provider: byokProviderValidator,
    ciphertext: v.string(),
    iv: v.string(),
    authTag: v.string(),
    keyVersion: v.number(),
    displaySuffix: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerCredentials")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
    const now = Date.now();
    const value = {
      ciphertext: args.ciphertext,
      iv: args.iv,
      authTag: args.authTag,
      keyVersion: args.keyVersion,
      displaySuffix: args.displaySuffix,
      updatedAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, value);
    } else {
      await ctx.db.insert("providerCredentials", {
        userId: args.userId,
        provider: args.provider,
        ...value,
        createdAt: now,
      });
    }
    return { ok: true } as const;
  },
});

export const internal_deleteCredential = backendMutation({
  args: { userId: v.string(), provider: byokProviderValidator },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
    if (credential) {
      await ctx.db.delete(credential._id);
    }
    const routing = await ctx.db
      .query("userModelRouting")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    if (routing) {
      const credentials = await ctx.db
        .query("providerCredentials")
        .withIndex("by_userId_and_updatedAt", (q) =>
          q.eq("userId", args.userId),
        )
        .collect();
      const config = filterRoutingForProviders(
        sanitizeModelRoutingConfig(routing),
        new Set(credentials.map((item) => item.provider)),
      );
      await ctx.db.patch(routing._id, {
        overrides: config.overrides,
        catalogVersion: config.catalogVersion,
        updatedAt: Date.now(),
      });
    }
    return { ok: true } as const;
  },
});

export const internal_updateRouting = backendMutation({
  args: { userId: v.string(), ...routingArgs },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("providerCredentials")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", args.userId))
      .collect();
    const config = filterRoutingForProviders(
      sanitizeModelRoutingConfig(args),
      new Set(credentials.map((credential) => credential.provider)),
    );
    const existing = await ctx.db
      .query("userModelRouting")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();
    const value = { ...config, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
    } else {
      await ctx.db.insert("userModelRouting", {
        userId: args.userId,
        ...value,
      });
    }
    return config;
  },
});

export const internal_reconcileUser = backendMutation({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const [credentials, routing] = await Promise.all([
      ctx.db
        .query("providerCredentials")
        .withIndex("by_userId_and_updatedAt", (q) =>
          q.eq("userId", args.userId),
        )
        .collect(),
      ctx.db
        .query("userModelRouting")
        .withIndex("by_userId", (q) => q.eq("userId", args.userId))
        .unique(),
    ]);
    const supportedProviders = new Set<string>(BYOK_PROVIDER_IDS);
    const unsupported = credentials.filter(
      (credential) => !supportedProviders.has(credential.provider),
    );
    await Promise.all(
      unsupported.map((credential) => ctx.db.delete(credential._id)),
    );
    const availableProviders = new Set(
      credentials
        .filter((credential) => supportedProviders.has(credential.provider))
        .map((credential) => credential.provider),
    );
    const config = filterRoutingForProviders(
      sanitizeModelRoutingConfig(routing ?? DEFAULT_MODEL_ROUTING_CONFIG),
      availableProviders,
    );
    if (routing && !routingConfigsEqual(routing, config)) {
      await ctx.db.patch(routing._id, { ...config, updatedAt: Date.now() });
    }
    return { removedCredentials: unsupported.length, config };
  },
});

function filterRoutingForProviders(
  config: UserModelRoutingConfig,
  availableProviders: ReadonlySet<ByokProviderId>,
): UserModelRoutingConfig {
  const overrides = config.overrides.filter((override) => {
    if (override.kind === "hosted") {
      return true;
    }
    const route = getModelRoute(override.routeId);
    return (
      route !== undefined &&
      isByokProviderId(route.provider) &&
      availableProviders.has(route.provider)
    );
  });
  return { ...config, overrides };
}

function routingConfigsEqual(
  current: UserModelRoutingConfig,
  next: UserModelRoutingConfig,
): boolean {
  return (
    current.preset === next.preset &&
    current.hostedFallback === next.hostedFallback &&
    current.catalogVersion === next.catalogVersion &&
    current.providerPriority.length === next.providerPriority.length &&
    current.providerPriority.every(
      (provider, index) => provider === next.providerPriority[index],
    ) &&
    current.overrides.length === next.overrides.length &&
    current.overrides.every((override, index) => {
      const candidate = next.overrides[index];
      if (override.modelId !== candidate?.modelId) {
        return false;
      }
      if (override.kind === "hosted") {
        return candidate.kind === "hosted";
      }
      return (
        candidate.kind === "byok" && override.routeId === candidate.routeId
      );
    })
  );
}
