import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";
import { isByokProviderId } from "@redux/shared/models";

import { env } from "@/env";
import {
  fetchAuthMutation,
  fetchAuthQuery,
  getRequestUserIdFromHeaders,
} from "@/lib/auth/server";
import { encryptProviderCredential } from "@/server/byok/crypto";

const credentialInput = z.object({
  apiKey: z.string().trim().min(1).max(20_000),
  accountId: z.string().trim().min(1).max(500).optional(),
});

export const Route = createFileRoute("/api/byok/credentials/$provider")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        if (!isSameOrigin(request)) {
          return new Response("Forbidden", { status: 403 });
        }
        const userId = await getRequestUserIdFromHeaders(request.headers);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        if (!isByokProviderId(params.provider)) {
          return new Response("Unsupported provider", { status: 404 });
        }
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
        const parsed = credentialInput.safeParse(
          await request.json().catch(() => undefined),
        );
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_credentials" },
            { status: 400 },
          );
        }
        if (params.provider === "workersai" && !parsed.data.accountId) {
          return Response.json(
            { error: "account_id_required" },
            { status: 400 },
          );
        }
        const payload = {
          apiKey: parsed.data.apiKey,
          ...(params.provider === "workersai"
            ? { accountId: parsed.data.accountId }
            : {}),
        };
        const encrypted = encryptProviderCredential({
          userId,
          provider: params.provider,
          payload,
        });
        await fetchAuthMutation(api.functions.byok.internal_upsertCredential, {
          secret: env.INTERNAL_CONVEX_SECRET,
          userId,
          provider: params.provider,
          ...encrypted,
          displaySuffix: parsed.data.apiKey.slice(-4),
        });
        return Response.json({ ok: true });
      },
      DELETE: async ({ request, params }) => {
        if (!isSameOrigin(request)) {
          return new Response("Forbidden", { status: 403 });
        }
        const userId = await getRequestUserIdFromHeaders(request.headers);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        if (!isByokProviderId(params.provider)) {
          return new Response("Unsupported provider", { status: 404 });
        }
        await fetchAuthMutation(api.functions.byok.internal_deleteCredential, {
          secret: env.INTERNAL_CONVEX_SECRET,
          userId,
          provider: params.provider,
        });
        return Response.json({ ok: true });
      },
    },
  },
});

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
