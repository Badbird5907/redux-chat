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
import { upsertProviderCredential } from "@/server/byok/credential-store";
import { isSameOriginOrMissing, logOAuthEvent } from "@/server/byok/oauth/http";

const credentialInput = z.object({
  apiKey: z.string().trim().min(1).max(20_000),
  accountId: z.string().trim().min(1).max(500).optional(),
});

export const Route = createFileRoute("/api/byok/credentials/$provider")({
  server: {
    handlers: {
      PUT: async ({ request, params }) => {
        if (!isSameOriginOrMissing(request)) {
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
          version: 2 as const,
          kind: "api_key" as const,
          source: "manual" as const,
          apiKey: parsed.data.apiKey,
          ...(params.provider === "workersai"
            ? { accountId: parsed.data.accountId }
            : {}),
        };
        await upsertProviderCredential({
          userId,
          provider: params.provider,
          payload,
          metadata: {
            displaySuffix: parsed.data.apiKey.slice(-4),
          },
        });
        return Response.json({ ok: true });
      },
      DELETE: async ({ request, params }) => {
        if (!isSameOriginOrMissing(request)) {
          return new Response("Forbidden", { status: 403 });
        }
        const userId = await getRequestUserIdFromHeaders(request.headers);
        if (!userId) return new Response("Unauthorized", { status: 401 });
        if (!isByokProviderId(params.provider)) {
          return new Response("Unsupported provider", { status: 404 });
        }
        const credential = await fetchAuthQuery(
          api.functions.byok.internal_getEncryptedCredential,
          {
            secret: env.INTERNAL_CONVEX_SECRET,
            userId,
            provider: params.provider,
          },
        );
        await fetchAuthMutation(api.functions.byok.internal_deleteCredential, {
          secret: env.INTERNAL_CONVEX_SECRET,
          userId,
          provider: params.provider,
        });
        if (credential?.connectionType === "chatgpt_oauth") {
          logOAuthEvent({
            connector: "chatgpt",
            connectorVersion: "0.2.0",
            stage: "disconnected",
            status: "success",
          });
        } else if (credential?.connectionType === "openrouter_oauth") {
          logOAuthEvent({
            connector: "openrouter",
            connectorVersion: "pkce-s256-v1",
            stage: "disconnected",
            status: "success",
          });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
