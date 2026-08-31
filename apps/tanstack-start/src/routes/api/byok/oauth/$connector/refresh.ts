import { createFileRoute } from "@tanstack/react-router";

import {
  isSameOrigin,
  logOAuthEvent,
  requireByokUser,
} from "@/server/byok/oauth/http";
import { BYOK_OAUTH_CONNECTORS } from "@/server/byok/oauth/registry";
import { isByokOAuthConnectorId } from "@/server/byok/oauth/types";

export const Route = createFileRoute("/api/byok/oauth/$connector/refresh")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (!isSameOrigin(request)) {
          return new Response("Forbidden", { status: 403 });
        }
        if (!isByokOAuthConnectorId(params.connector)) {
          return new Response("Unsupported connector", { status: 404 });
        }
        const connector = BYOK_OAUTH_CONNECTORS[params.connector];
        if (!connector.refresh) {
          return new Response("Connector does not support refresh", {
            status: 405,
          });
        }
        const auth = await requireByokUser(request);
        if ("response" in auth) return auth.response;
        try {
          const result = await connector.refresh({ userId: auth.userId });
          if (!result) {
            return Response.json(
              { error: "oauth_connection_not_found" },
              { status: 404 },
            );
          }
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: "refreshed",
            status: "success",
            modelCount: result.modelCount,
          });
          return Response.json({
            ok: true,
            modelCount: result.modelCount,
          });
        } catch (error) {
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: "refresh_failed",
            status: "failure",
          });
          return Response.json(
            {
              error: "chatgpt_refresh_failed",
              message:
                error instanceof Error ? error.message : "Refresh failed",
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
