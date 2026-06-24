import { createFileRoute } from "@tanstack/react-router";

import { env } from "@/env";

export const Route = createFileRoute("/api/deployment-id")({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          deploymentId: env.VERCEL_DEPLOYMENT_ID ?? null,
        }),
    },
  },
});
