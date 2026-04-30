import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/polar/checkout")({
  server: {
    handlers: {
      GET: () =>
        new Response(
          "Polar checkout is generated through Convex actions, not the app route.",
          { status: 410 },
        ),
    },
  },
});
