import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";

import type {
  ByokProviderId,
  ByokRouteAvailability,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import {
  BYOK_PROVIDER_IDS,
  DEFAULT_MODEL_ROUTING_CONFIG,
  getModelRoute,
  isByokProviderId,
  isByokRouteAvailable,
  sanitizeModelRoutingConfig,
} from "@redux/shared/models";

import type { DataModel } from "../_generated/dataModel";
import {
  byokProviderValidator,
  modelRoutingOverrideValidator,
  providerConnectionTypeValidator,
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
    const availability = availabilityFromCredentials(credentials);
    const config = filterRoutingForAvailability(
      sanitizeModelRoutingConfig(routing),
      availability,
    );

    return {
      credentials: credentials
        .map((credential) => ({
          provider: credential.provider,
          displaySuffix: credential.displaySuffix,
          connectionType: credential.connectionType ?? "api_key",
          displayLabel: credential.displayLabel,
          availableModelIds: credential.availableModelIds,
          supportsImageGeneration: credential.supportsImageGeneration ?? false,
          revision: credential.revision ?? 1,
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
        displaySuffix: credential.displaySuffix,
        connectionType: credential.connectionType ?? "api_key",
        displayLabel: credential.displayLabel,
        availableModelIds: credential.availableModelIds,
        supportsImageGeneration: credential.supportsImageGeneration ?? false,
        revision: credential.revision ?? 1,
      })),
      routing: filterRoutingForAvailability(
        sanitizeModelRoutingConfig(routing),
        availabilityFromCredentials(credentials),
      ),
    };
  },
});

export const internal_getEncryptedCredential = backendQuery({
  args: { userId: v.string(), provider: byokProviderValidator },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
    if (!credential) return null;
    return {
      provider: credential.provider,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      authTag: credential.authTag,
      keyVersion: credential.keyVersion,
      displaySuffix: credential.displaySuffix,
      connectionType: credential.connectionType ?? "api_key",
      displayLabel: credential.displayLabel,
      availableModelIds: credential.availableModelIds,
      supportsImageGeneration: credential.supportsImageGeneration ?? false,
      revision: credential.revision ?? 1,
    };
  },
});

const credentialWriteArgs = {
  userId: v.string(),
  provider: byokProviderValidator,
  ciphertext: v.string(),
  iv: v.string(),
  authTag: v.string(),
  keyVersion: v.number(),
  displaySuffix: v.string(),
  connectionType: providerConnectionTypeValidator,
  displayLabel: v.optional(v.string()),
  availableModelIds: v.optional(v.array(v.string())),
  supportsImageGeneration: v.optional(v.boolean()),
};

export const internal_upsertCredential = backendMutation({
  args: credentialWriteArgs,
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
      connectionType: args.connectionType,
      displayLabel: args.displayLabel,
      availableModelIds: args.availableModelIds,
      supportsImageGeneration: args.supportsImageGeneration,
      revision: existing ? (existing.revision ?? 1) + 1 : 1,
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
    await reconcileStoredRouting(ctx, args.userId);
    return { ok: true } as const;
  },
});

export const internal_replaceCredentialIfRevision = backendMutation({
  args: { ...credentialWriteArgs, expectedRevision: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerCredentials")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
    if (!existing || (existing.revision ?? 1) !== args.expectedRevision) {
      return {
        updated: false,
        revision: existing?.revision ?? (existing ? 1 : undefined),
      } as const;
    }
    const revision = args.expectedRevision + 1;
    await ctx.db.patch(existing._id, {
      ciphertext: args.ciphertext,
      iv: args.iv,
      authTag: args.authTag,
      keyVersion: args.keyVersion,
      displaySuffix: args.displaySuffix,
      connectionType: args.connectionType,
      displayLabel: args.displayLabel,
      availableModelIds: args.availableModelIds,
      supportsImageGeneration: args.supportsImageGeneration,
      revision,
      updatedAt: Date.now(),
    });
    await reconcileStoredRouting(ctx, args.userId);
    return { updated: true, revision } as const;
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
    await reconcileStoredRouting(ctx, args.userId);
    return { ok: true } as const;
  },
});

export const internal_deleteCredentialIfRevision = backendMutation({
  args: {
    userId: v.string(),
    provider: byokProviderValidator,
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
    if (!credential || (credential.revision ?? 1) !== args.expectedRevision) {
      return { deleted: false } as const;
    }
    await ctx.db.delete(credential._id);
    await reconcileStoredRouting(ctx, args.userId);
    return { deleted: true } as const;
  },
});

export const internal_updateRouting = backendMutation({
  args: { userId: v.string(), ...routingArgs },
  handler: async (ctx, args) => {
    const credentials = await ctx.db
      .query("providerCredentials")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", args.userId))
      .collect();
    const config = filterRoutingForAvailability(
      sanitizeModelRoutingConfig(args),
      availabilityFromCredentials(credentials),
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
    const supportedCredentials = credentials.filter((credential) =>
      supportedProviders.has(credential.provider),
    );
    const config = filterRoutingForAvailability(
      sanitizeModelRoutingConfig(routing ?? DEFAULT_MODEL_ROUTING_CONFIG),
      availabilityFromCredentials(supportedCredentials),
    );
    if (routing && !routingConfigsEqual(routing, config)) {
      await ctx.db.patch(routing._id, { ...config, updatedAt: Date.now() });
    }
    return { removedCredentials: unsupported.length, config };
  },
});

function filterRoutingForAvailability(
  config: UserModelRoutingConfig,
  availability: ByokRouteAvailability,
): UserModelRoutingConfig {
  const overrides = config.overrides.filter((override) => {
    if (override.kind === "hosted") {
      return true;
    }
    const route = getModelRoute(override.routeId);
    return (
      route !== undefined &&
      isByokProviderId(route.provider) &&
      isByokRouteAvailable(route, availability)
    );
  });
  return { ...config, overrides };
}

function availabilityFromCredentials(
  credentials: readonly {
    provider: ByokProviderId;
    connectionType?: "api_key" | "chatgpt_oauth" | "openrouter_oauth";
    availableModelIds?: string[];
    supportsImageGeneration?: boolean;
  }[],
): ByokRouteAvailability {
  return new Map(
    credentials.map((credential) => [
      credential.provider,
      credential.connectionType === "chatgpt_oauth"
        ? {
            kind: "models" as const,
            modelIds: new Set(credential.availableModelIds ?? []),
            supportsImageGeneration:
              credential.supportsImageGeneration === true,
          }
        : { kind: "all" as const },
    ]),
  );
}

async function reconcileStoredRouting(
  ctx: GenericMutationCtx<DataModel>,
  userId: string,
): Promise<void> {
  const [routing, credentials] = await Promise.all([
    ctx.db
      .query("userModelRouting")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique(),
    ctx.db
      .query("providerCredentials")
      .withIndex("by_userId_and_updatedAt", (q) => q.eq("userId", userId))
      .collect(),
  ]);
  if (!routing) return;
  const config = filterRoutingForAvailability(
    sanitizeModelRoutingConfig(routing),
    availabilityFromCredentials(credentials),
  );
  if (!routingConfigsEqual(routing, config)) {
    await ctx.db.patch(routing._id, { ...config, updatedAt: Date.now() });
  }
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
