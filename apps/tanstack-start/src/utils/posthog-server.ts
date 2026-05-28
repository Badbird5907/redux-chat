import { PostHog } from "posthog-node";

import { env } from "@/env";

let posthogClient: PostHog | null = null;

export function getPostHogClient(): PostHog | null {
  if (!env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN) {
    return null;
  }

  posthogClient ??= new PostHog(env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
    host: env.VITE_PUBLIC_POSTHOG_HOST,
    flushAt: 1,
    flushInterval: 0,
  });

  return posthogClient;
}
