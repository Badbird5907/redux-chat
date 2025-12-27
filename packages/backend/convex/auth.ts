import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { betterAuth,env } from "better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { oAuthProxy } from "better-auth/plugins";
import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import type { DataModel } from "@redux/backend/convex/_generated/dataModel";
import authConfig from "@redux/backend/convex/auth.config";
import { components } from "@redux/backend/convex/_generated/api";

export const authComponent = createClient<DataModel>(components.betterAuth)

export function initAuth(ctx: GenericCtx<DataModel>) {
  const config = {
    database: authComponent.adapter(ctx),
    baseURL: env.NEXT_PUBLIC_CONVEX_SITE_URL,
    secret: env.AUTH_SECRET,
    plugins: [
      oAuthProxy({
        productionURL: env.NEXT_PUBLIC_CONVEX_SITE_URL,
      }),
      convex({ authConfig }),
    ],
    socialProviders: {
      github: {
        redirectURI: `${env.NEXT_PUBLIC_CONVEX_SITE_URL}/api/auth/callback/github`,
        clientId: env.AUTH_GITHUB_ID ?? "",
        clientSecret: env.AUTH_GITHUB_SECRET ?? "",
      }
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

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
