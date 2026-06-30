import { auth } from "@ai-sdk/mcp";
import { createFileRoute } from "@tanstack/react-router";

import { api } from "@redux/backend/convex/_generated/api";

import { assertAllowedMcpServerUrl } from "@/lib/ai/tools";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { ServerMcpOAuthProvider } from "@/lib/mcp/oauth-provider";

export const Route = createFileRoute("/api/mcp/oauth/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const errorDescription = url.searchParams.get("error_description");

        if (error) {
          return new Response(
            resultHtml(
              false,
              `Authorization denied: ${escapeHtml(errorDescription ?? error)}`,
            ),
            { status: 400, headers: { "Content-Type": "text/html" } },
          );
        }

        if (!code || !state) {
          return new Response(
            resultHtml(false, "Missing authorization code or state parameter"),
            { status: 400, headers: { "Content-Type": "text/html" } },
          );
        }

        // Look up the flow by state
        let flow: Awaited<
          ReturnType<
            typeof fetchAuthQuery<
              typeof api.functions.mcpServers.getOAuthFlowByState
            >
          >
        >;
        try {
          flow = await fetchAuthQuery(
            api.functions.mcpServers.getOAuthFlowByState,
            { state },
          );
        } catch {
          return new Response(resultHtml(false, "Authentication required"), {
            status: 401,
            headers: { "Content-Type": "text/html" },
          });
        }

        if (!flow) {
          return new Response(
            resultHtml(
              false,
              "OAuth flow expired or not found. Please try connecting again.",
            ),
            { status: 400, headers: { "Content-Type": "text/html" } },
          );
        }

        try {
          assertAllowedMcpServerUrl(flow.serverUrl);
        } catch {
          return new Response(resultHtml(false, "Invalid MCP server URL"), {
            status: 400,
            headers: { "Content-Type": "text/html" },
          });
        }

        const origin = url.origin;
        const callbackUrl = `${origin}/api/mcp/oauth/callback`;

        let savedTokens: {
          access_token: string;
          token_type: string;
          refresh_token?: string;
          expires_in?: number;
          scope?: string;
        } | null = null;

        const provider = new ServerMcpOAuthProvider({
          callbackRedirectUrl: callbackUrl,
          preloadedState: {
            codeVerifier: flow.codeVerifier,
            state: flow.state,
            clientId: flow.clientId,
            clientSecret: flow.clientSecret,
            authorizationServerUrl: flow.authorizationServerUrl,
            tokenEndpoint: flow.tokenEndpoint,
          },
          onTokensSaved: (tokens) => {
            savedTokens = {
              access_token: tokens.access_token,
              token_type: tokens.token_type,
              refresh_token: tokens.refresh_token,
              expires_in: tokens.expires_in,
              scope: tokens.scope,
            };
          },
        });

        try {
          const result = await auth(provider, {
            serverUrl: flow.serverUrl,
            authorizationCode: code,
            callbackState: state,
          });

          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- savedTokens is set via callback
          if (result !== "AUTHORIZED" || !savedTokens) {
            return new Response(
              resultHtml(false, "Token exchange failed. Please try again."),
              { status: 500, headers: { "Content-Type": "text/html" } },
            );
          }

          // Persist tokens in Convex
          await fetchAuthMutation(api.functions.mcpServers.saveOAuthTokens, {
            mcpServerId: flow.mcpServerId,
            flowId: flow.flowId,
            tokens: savedTokens,
            clientInfo: {
              client_id: flow.clientId,
              client_secret: flow.clientSecret,
            },
          });

          return new Response(
            resultHtml(true, "OAuth connected successfully!"),
            { status: 200, headers: { "Content-Type": "text/html" } },
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Token exchange failed";
          return new Response(
            resultHtml(false, `OAuth error: ${escapeHtml(message)}`),
            { status: 500, headers: { "Content-Type": "text/html" } },
          );
        }
      },
    },
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resultHtml(success: boolean, message: string): string {
  const color = success ? "#10b981" : "#ef4444";
  return `<!DOCTYPE html>
<html><head><title>MCP OAuth</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
<div style="text-align:center;max-width:400px;padding:2rem">
<div style="font-size:2rem;margin-bottom:1rem">${success ? "&#10003;" : "&#10007;"}</div>
<p style="color:${color};font-weight:500">${message}</p>
<p style="color:#888;font-size:0.875rem;margin-top:1rem">This window will close automatically.</p>
</div>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'mcp-oauth-complete', success: ${success} }, '*');
    setTimeout(() => window.close(), 1500);
  }
</script>
</body></html>`;
}
