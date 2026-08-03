import { createFileRoute } from "@tanstack/react-router";

import {
  logOAuthEvent,
  oauthAuthFailureResponse,
  oauthResultHtml,
  requireByokUser,
} from "@/server/byok/oauth/http";
import { BYOK_OAUTH_CONNECTORS } from "@/server/byok/oauth/registry";
import { isByokOAuthConnectorId } from "@/server/byok/oauth/types";

export const Route = createFileRoute("/api/byok/oauth/$connector/callback")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!isByokOAuthConnectorId(params.connector)) {
          return new Response("Unsupported connector", { status: 404 });
        }
        const connector = BYOK_OAUTH_CONNECTORS[params.connector];
        if (!connector.completeRedirect) {
          return new Response("Connector does not use a callback", {
            status: 405,
          });
        }
        const auth = await requireByokUser(request);
        if ("response" in auth) {
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: "callback_auth_failed",
            status: "failure",
          });
          return oauthAuthFailureResponse({
            request,
            connector: params.connector,
            authResponse: auth.response,
          });
        }
        const url = new URL(request.url);
        const flowId = url.searchParams.get("flow");
        const code = url.searchParams.get("code");
        const upstreamError =
          url.searchParams.get("error_description") ??
          url.searchParams.get("error");
        if (upstreamError || !flowId || !code) {
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: upstreamError ? "denied" : "callback",
            status: "failure",
          });
          return new Response(
            oauthResultHtml({
              request,
              connector: params.connector,
              flowId: flowId ?? undefined,
              success: false,
              message: upstreamError ?? "Missing authorization response.",
            }),
            { status: 400, headers: { "Content-Type": "text/html" } },
          );
        }
        try {
          await connector.completeRedirect({
            userId: auth.userId,
            flowId,
            code,
          });
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: "connected",
            status: "success",
          });
          return new Response(
            oauthResultHtml({
              request,
              connector: params.connector,
              flowId,
              success: true,
              message: "OpenRouter connected successfully.",
            }),
            { status: 200, headers: { "Content-Type": "text/html" } },
          );
        } catch (error) {
          logOAuthEvent({
            connector: params.connector,
            connectorVersion: connector.version,
            stage: "callback_failed",
            status: "failure",
          });
          return new Response(
            oauthResultHtml({
              request,
              connector: params.connector,
              flowId,
              success: false,
              message:
                error instanceof Error ? error.message : "Connection failed.",
            }),
            { status: 502, headers: { "Content-Type": "text/html" } },
          );
        }
      },
    },
  },
});
