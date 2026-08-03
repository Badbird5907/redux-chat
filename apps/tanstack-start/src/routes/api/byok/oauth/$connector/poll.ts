import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  isSameOrigin,
  logOAuthEvent,
  requireByokUser,
} from "@/server/byok/oauth/http";
import { BYOK_OAUTH_CONNECTORS } from "@/server/byok/oauth/registry";
import { isByokOAuthConnectorId } from "@/server/byok/oauth/types";

const input = z.object({ flowId: z.string().uuid() });

export const Route = createFileRoute("/api/byok/oauth/$connector/poll")({
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
        if (!connector.poll) {
          return new Response("Connector does not use polling", {
            status: 405,
          });
        }
        const auth = await requireByokUser(request);
        if ("response" in auth) return auth.response;
        const parsed = input.safeParse(
          await request.json().catch(() => undefined),
        );
        if (!parsed.success) {
          return Response.json(
            { error: "invalid_oauth_flow" },
            { status: 400 },
          );
        }
        try {
          const result = await connector.poll({
            userId: auth.userId,
            flowId: parsed.data.flowId,
          });
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: result.status,
            status:
              result.status === "pending"
                ? "pending"
                : result.status === "connected"
                  ? "success"
                  : "failure",
          });
          return Response.json(result);
        } catch (error) {
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: "poll_failed",
            status: "failure",
          });
          console.error("BYOK OAuth polling failed", {
            connector: params.connector,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return Response.json(
            {
              error: "oauth_poll_failed",
              message:
                error instanceof Error ? error.message : "Connection failed",
            },
            { status: 502 },
          );
        }
      },
    },
  },
});
