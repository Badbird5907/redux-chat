import type { LanguageModel } from "ai";
import { withTracing } from "@posthog/ai";

import { getPostHogClient } from "@/utils/posthog-server";

type WrappableModel = Parameters<typeof withTracing>[0];

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

  return withTracing(model as WrappableModel, ph, {
    posthogDistinctId: distinctId,
  });
}
