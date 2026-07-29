import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";
import { BYOK_PROVIDER_IDS } from "@redux/shared/models";

import { env } from "@/env";
import {
  fetchAuthMutation,
  fetchAuthQuery,
  getRequestUserIdFromHeaders,
} from "@/lib/auth/server";

const provider = z.enum(BYOK_PROVIDER_IDS);
const input = z.object({
  preset: z.enum(["native_first", "openrouter_first", "custom"]),
  providerPriority: z.array(provider),
  hostedFallback: z.boolean(),
  overrides: z.array(
    z.discriminatedUnion("kind", [
      z.object({ modelId: z.string(), kind: z.literal("hosted") }),
      z.object({
        modelId: z.string(),
        kind: z.literal("byok"),
        routeId: z.string(),
      }),
    ]),
  ),
});

export const Route = createFileRoute("/api/byok/routing")({
  server: {
    handlers: {
      PUT: async ({ request }) => {
        if (!isSameOrigin(request)) {
          return new Response("Forbidden", { status: 403 });
        }
        const userId = await getRequestUserIdFromHeaders(request.headers);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        const billing = await fetchAuthQuery(
          api.functions.billing.getCurrentBillingState,
          {},
        );
        if (!billing.entitlements.byok) {
          return Response.json(
            { error: "byok_plan_required" },
            { status: 403 },
          );
        }
        const parsed = input.safeParse(await request.json());
        if (!parsed.success) {
          return Response.json({ error: "invalid_routing" }, { status: 400 });
        }
        const routing = await fetchAuthMutation(
          api.functions.byok.internal_updateRouting,
          {
            secret: env.INTERNAL_CONVEX_SECRET,
            userId,
            ...parsed.data,
          },
        );
        return Response.json({ ok: true, routing });
      },
    },
  },
});

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
