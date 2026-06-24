import type { LanguageModel } from "ai";
import { withTracing } from "@posthog/ai";

import { getPostHogClient } from "@/utils/posthog-server";

type WrappableModel = Parameters<typeof withTracing>[0];

export interface PostHogUserInfo {
  email?: string;
  name?: string;
}

/**
 * Identifies a user in PostHog with their email/name so the AI
 * Observability dashboard shows human-readable info instead of raw IDs.
 */
export function identifyPostHogUser(
  distinctId: string,
  userInfo: PostHogUserInfo,
): void {
  const ph = getPostHogClient();
  if (!ph) return;

  const properties: Record<string, string> = {};
  if (userInfo.email) properties.email = userInfo.email;
  if (userInfo.name) properties.name = userInfo.name;

  if (Object.keys(properties).length > 0) {
    ph.identify({ distinctId, properties });
  }
}

/**
 * Wraps a Vercel AI SDK language model with PostHog AI observability.
 * Returns the original model unchanged if PostHog is not configured.
 */
export function withPostHogTracing(
  model: LanguageModel,
  distinctId: string,
): LanguageModel {
  const ph = getPostHogClient();
  if (!ph) return model;

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
  return withTracing(model as WrappableModel, ph, {
    posthogDistinctId: distinctId,
  });
}
