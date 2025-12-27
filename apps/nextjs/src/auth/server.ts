import "server-only";

// import { cache } from "react";
// import { headers } from "next/headers";
// import { nextCookies } from "better-auth/next-js";

// import { initAuth } from "@redux/auth";

// import { env } from "@/env";

// const baseUrl =
//   env.VERCEL_ENV === "production"
//     ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
//     : env.VERCEL_ENV === "preview"
//       ? `https://${env.VERCEL_URL}`
//       : "http://localhost:3000";

// const productionUrl = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";
// export const auth = initAuth({
//   baseUrl,
//   productionUrl,
//   secret: env.AUTH_SECRET,
//   socialProviders: {
//     github: {
//       clientId: env.AUTH_GITHUB_ID,
//       clientSecret: env.AUTH_GITHUB_SECRET,
//     }
//   },
//   extraPlugins: [nextCookies()],
// });

// export const getSession = cache(async () =>
//   auth.api.getSession({ headers: await headers() }),
// );

import { convexBetterAuthNextJs } from "@convex-dev/better-auth/nextjs";
import { env } from "@/env";
import { ConvexError } from "convex/values";

export const isAuthError = (error: unknown) => {
  // This broadly matches potentially auth related errors, can be rewritten to
  // work with your app's own error handling.
  const message =
    (error instanceof ConvexError && typeof error.data === "string" ? error.data : "") ||
    (error instanceof Error && error.message) ||
    "";
  // Loose match for auth related errors
  return /auth/i.test(message);
};

export const {
  handler,
  preloadAuthQuery,
  isAuthenticated,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthNextJs({
  convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
  convexSiteUrl: env.NEXT_PUBLIC_CONVEX_SITE_URL,
  
  jwtCache: {
    enabled: true,
    isAuthError,
  }
});
