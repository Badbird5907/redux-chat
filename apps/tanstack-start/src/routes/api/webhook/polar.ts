import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/webhook/polar")({
  server: {
    handlers: {
      POST: () =>
        new Response(
          "Polar webhooks are handled by Convex at /polar/events.",
          { status: 410 },
        ),
    },
  },
});
