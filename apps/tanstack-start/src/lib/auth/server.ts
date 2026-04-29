import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";
import { getToken as getConvexToken } from "@convex-dev/better-auth/utils";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";

// import { env } from '@/env'

const isAuthError = (error: unknown) => {
  // This broadly matches potentially auth related errors, can be rewritten to
  // work with your app's own error handling.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const message =
    (error instanceof ConvexError && error.data) ??
    (error instanceof Error && error.message) ??
    "";
  return /auth/i.test(message as string);
};

async function getAuthTokenFromHeaders(
  headers: Headers,
): Promise<string | undefined> {
  const mutableHeaders = new Headers(headers);
  mutableHeaders.delete("content-length");
  mutableHeaders.delete("transfer-encoding");
  mutableHeaders.set("accept-encoding", "identity");

  const token = await getConvexToken(env.VITE_CONVEX_SITE_URL, mutableHeaders, {
    jwtCache: {
      enabled: true,
      isAuthError,
    },
  });

  return token.token;
}

export async function getRequestUserIdFromHeaders(
  headers: Headers,
): Promise<string | undefined> {
  const token = await getAuthTokenFromHeaders(headers);
  if (!token) {
    return undefined;
  }

  const client = new ConvexHttpClient(env.VITE_CONVEX_URL);
  client.setAuth(token);

  return client
    .query(api.functions.user.getCurrentUserId, {})
    .then(({ userId }) => userId)
    .catch((error: unknown) => {
      if (isAuthError(error)) {
        return undefined;
      }
      throw error;
    });
}

export const {
  handler,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthReactStart({
  convexUrl: env.VITE_CONVEX_URL,
  convexSiteUrl: env.VITE_CONVEX_SITE_URL,
  jwtCache: {
    enabled: true,
    isAuthError,
  },
});
