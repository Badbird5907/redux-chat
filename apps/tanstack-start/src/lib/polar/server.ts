import type { CheckoutConfig } from "@polar-sh/tanstack-start";
import { Polar } from "@polar-sh/sdk";

import { env } from "@/env";

export function getPolarServer() {
  return env.POLAR_SERVER === "production" ? "production" : "sandbox";
}

export function getPolarClient() {
  return new Polar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: getPolarServer(),
  });
}

export function getPolarCheckoutConfig(): CheckoutConfig {
  return {
    accessToken: env.POLAR_ACCESS_TOKEN,
    server: getPolarServer(),
    successUrl: env.POLAR_SUCCESS_URL,
    returnUrl: env.POLAR_RETURN_URL,
  };
}

export function getPolarWebhookSecret() {
  return env.POLAR_WEBHOOK_SECRET;
}
