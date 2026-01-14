import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'
import { env } from '@/env';
import { ConvexError } from 'convex/values';
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
  }
})