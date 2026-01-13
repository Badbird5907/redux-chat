import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'
// import { env } from '@/env'

export const {
  handler,
  getToken,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction,
} = convexBetterAuthReactStart({
  convexUrl: import.meta.env.VITE_CONVEX_URL as string,
  convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL as string,
})