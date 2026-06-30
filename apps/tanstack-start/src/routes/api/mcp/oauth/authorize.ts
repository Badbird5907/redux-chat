import { auth } from "@ai-sdk/mcp";
import { createFileRoute } from "@tanstack/react-router";

import { api } from "@redux/backend/convex/_generated/api";

import { assertAllowedMcpServerUrl } from "@/lib/ai/tools";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { ServerMcpOAuthProvider } from "@/lib/mcp/oauth-provider";

export const Route = createFileRoute("/api/mcp/oauth/authorize")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mcpServerId = url.searchParams.get("mcpServerId");

        if (!mcpServerId) {
          return new Response("Missing mcpServerId", { status: 400 });
        }

        const origin = url.origin;
        const callbackUrl = `${origin}/api/mcp/oauth/callback`;

        let servers: Awaited<
          ReturnType<typeof fetchAuthQuery<typeof api.functions.mcpServers.getByIds>>
        >;
        try {
          servers = await fetchAuthQuery(api.functions.mcpServers.getByIds, {
            serverIds: [mcpServerId],
          });
        } catch {
          return new Response("Unauthorized", { status: 401 });
        }

        const server = servers[0];
        if (!server) {
          return new Response("MCP server not found", { status: 404 });
        }

        try {
          assertAllowedMcpServerUrl(server.url);
        } catch {
          return new Response("Invalid MCP server URL", { status: 400 });
        }

        const provider = new ServerMcpOAuthProvider({
          callbackRedirectUrl: callbackUrl,
        });

        try {
          const result = await auth(provider, {
            serverUrl: server.url,
          });

          if (result === "AUTHORIZED") {
            return new Response(
              closeWindowHtml("Already authorized. You can close this window."),
              { status: 200, headers: { "Content-Type": "text/html" } },
            );
          }

          const collected = provider.collectedState;
          if (!collected) {
            return new Response("OAuth flow failed to initialize", {
              status: 500,
            });
          }

          // Persist the flow state so the callback can retrieve it
          const flowId = crypto.randomUUID();
          await fetchAuthMutation(api.functions.mcpServers.createOAuthFlow, {
            mcpServerId,
            flowId,
            serverUrl: server.url,
            codeVerifier: collected.codeVerifier,
            state: collected.state,
            clientId: collected.clientId,
            clientSecret: collected.clientSecret,
            authorizationServerUrl: collected.authorizationServerUrl,
            tokenEndpoint: collected.tokenEndpoint,
          });

          // Redirect the user to the authorization server
          return new Response(null, {
            status: 302,
            headers: { Location: collected.authorizationUrl },
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "OAuth initiation failed";
          return new Response(
            closeWindowHtml(`OAuth error: ${escapeHtml(message)}`),
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

function closeWindowHtml(message: string): string {
  return `<!DOCTYPE html>
<html><head><title>MCP OAuth</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
<div style="text-align:center">
<p>${message}</p>
<p><button onclick="window.close()">Close window</button></p>
</div>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'mcp-oauth-complete' }, '*');
  }
</script>
</body></html>`;
}
