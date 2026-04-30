import { getPolarWebhookSecret } from "@/lib/polar/server";
import { Webhooks } from "@polar-sh/tanstack-start";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhook/polar")({
  server: {
    handlers: {
      POST: Webhooks({
        webhookSecret: getPolarWebhookSecret(),
        onPayload: async (payload) => {
          // Handle the payload
          // No need to return an acknowledge response
        },
      }),
    },
  },
});