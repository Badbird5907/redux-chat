import type { AuthFunctions, GenericCtx } from "@convex-dev/better-auth";
import type { BetterAuthOptions } from "better-auth/minimal";
// import { oAuthProxy } from "better-auth/plugins";
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { admin } from "better-auth/plugins";

import type { DataModel } from "@redux/backend/convex/_generated/dataModel";
import { components, internal } from "@redux/backend/convex/_generated/api";

// eslint-disable-next-line no-restricted-imports
import { internalAction } from "./_generated/server";
import authConfig from "./auth.config";
import { auditLog } from "./betterAuth/audit_log";
import authSchema from "./betterAuth/schema";
import { backendEnv } from "./env";

const authFunctions: AuthFunctions = internal.auth;
export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    authFunctions,
    triggers: {},
    local: {
      schema: authSchema,
    },
  },
);
export const { onCreate, onUpdate, onDelete } = authComponent.triggersApi();

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const env = backendEnv();

  return {
    database: authComponent.adapter(ctx),
    baseURL: env.SITE_URL,
    secret: env.AUTH_SECRET,

    plugins: [
      // oAuthProxy({
      //   productionURL: env.BASE_URL,
      // }),
      admin(),
      auditLog({
        nonBlocking: false,
        // eslint-disable-next-line @typescript-eslint/require-await
        beforeLog: async (entry) => {
          const { action } = entry;
          const ignoredPatterns = [
            /^convex:.*$/,
            /^get-session$/,
            /^list-accounts$/,
            /^admin:get-user$/,
            /^admin:list-.*$/,
            /^audit-log:list$/,
          ];
          const isIgnored = ignoredPatterns.some((pattern) =>
            pattern.test(action),
          );
          if (isIgnored) {
            // we don't want to log internal stuff/useless

            return null;
          }
          return entry;
        },
        retention: {
          enabled: false,
          days: 0,
        },
      }),
      convex({ authConfig }),
    ],
    socialProviders: {
      github: {
        // redirectURI: `${env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/auth/callback/github`,
        clientId: env.AUTH_GITHUB_ID,
        clientSecret: env.AUTH_GITHUB_SECRET,
      },
      google: {
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    onAPIError: {
      onError(error, ctx) {
        const errorObject =
          error instanceof Error
            ? {
                name: error.name,
                message: error.message,
              }
            : {
                name: "UnknownError",
                message: String(error),
              };
        console.error("BETTER AUTH API ERROR", {
          ...errorObject,
          status:
            error &&
            typeof error === "object" &&
            "status" in error &&
            typeof error.status === "number"
              ? error.status
              : undefined,
          path:
            ctx && "path" in ctx && typeof ctx.path === "string"
              ? ctx.path
              : undefined,
        });
      },
    },
  } satisfies BetterAuthOptions;
};

export function initAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth(createAuthOptions(ctx));
}

export const getLatestJwks = internalAction({
  args: {},
  handler: async (ctx) => {
    const auth = initAuth(ctx);
    // idk
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await auth.api.getLatestJwks();
  },
});

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
