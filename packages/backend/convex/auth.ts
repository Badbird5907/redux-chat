import type { AuthFunctions, GenericCtx } from "@convex-dev/better-auth";
import type { BetterAuthOptions } from "better-auth/minimal";
// import { oAuthProxy } from "better-auth/plugins";
import { createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";

import type { DataModel } from "@redux/backend/convex/_generated/dataModel";
import { components, internal } from "@redux/backend/convex/_generated/api";

import authConfig from "./auth.config";
import authSchema from "./betterAuth/schema";
import { backendEnv } from "./env";

const authFunctions: AuthFunctions = internal.auth
export const authComponent = createClient<DataModel, typeof authSchema>(
  components.betterAuth,
  {
    authFunctions,
    triggers: {
    },
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
      convex({ authConfig }),
    ],
    socialProviders: {
      github: {
        // redirectURI: `${env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/auth/callback/github`,
        clientId: env.AUTH_GITHUB_ID,
        clientSecret: env.AUTH_GITHUB_SECRET,
      },
    },
    emailAndPassword: {
      enabled: true,
    },
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;
};

export function initAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth(createAuthOptions(ctx));
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
