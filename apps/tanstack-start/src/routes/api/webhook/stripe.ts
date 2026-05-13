import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhook/stripe")({
  server: {
    handlers: {
      GET: () =>
        new Response("Stripe webhooks are handled by Convex at /stripe/webhook.", {
          status: 200,
        }),
    },
  },
});
