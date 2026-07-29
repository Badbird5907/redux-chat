import { createFileRoute } from "@tanstack/react-router";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import {
  fetchAuthMutation,
  getRequestUserIdFromHeaders,
} from "@/lib/auth/server";

export const Route = createFileRoute("/api/byok/reconcile")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && origin !== new URL(request.url).origin) {
          return new Response("Forbidden", { status: 403 });
        }
        const userId = await getRequestUserIdFromHeaders(request.headers);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const result = await fetchAuthMutation(
          api.functions.byok.internal_reconcileUser,
          { secret: env.INTERNAL_CONVEX_SECRET, userId },
        );
        return Response.json({ ok: true, ...result });
      },
    },
  },
});
