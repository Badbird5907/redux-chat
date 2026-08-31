import { createFileRoute } from "@tanstack/react-router";

import {
  isSameOrigin,
  logOAuthEvent,
  requireByokUser,
} from "@/server/byok/oauth/http";
import { checkStartRateLimit } from "@/server/byok/oauth/redis-coordination";
import { BYOK_OAUTH_CONNECTORS } from "@/server/byok/oauth/registry";
import { isByokOAuthConnectorId } from "@/server/byok/oauth/types";

export const Route = createFileRoute("/api/byok/oauth/$connector/start")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isSameOrigin(request)) {
          return new Response("Forbidden", { status: 403 });
        }
        if (!isByokOAuthConnectorId(params.connector)) {
          return new Response("Unsupported connector", { status: 404 });
        }
        const auth = await requireByokUser(request);
        if ("response" in auth) return auth.response;
        if (
          !(await checkStartRateLimit({
            userId: auth.userId,
            connector: params.connector,
          }))
        ) {
          return Response.json(
            { error: "oauth_start_rate_limited" },
            { status: 429 },
          );
        }
        const connector = BYOK_OAUTH_CONNECTORS[params.connector];
        try {
          const result = await connector.start({
            userId: auth.userId,
            origin: new URL(request.url).origin,
          });
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: "authorization_started",
            status: "success",
          });
          return Response.json(result);
        } catch (error) {
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: "authorization_start_failed",
            status: "failure",
          });
          console.error("BYOK OAuth start failed", {
            connector: params.connector,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return Response.json(
            { error: "oauth_start_failed" },
            { status: 502 },
          );
        }
      },
    },
  },
});
