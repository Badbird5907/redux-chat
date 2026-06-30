import { createMCPClient } from "@ai-sdk/mcp";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { assertAllowedMcpServerUrl, createMcpFetch } from "@/lib/ai/tools";
import { fetchAuthQuery, getRequestUserIdFromHeaders } from "@/lib/auth/server";

const requestSchema = z.object({
  mcpServerId: z.string().min(1),
});

export const Route = createFileRoute("/api/mcp/discover-tools")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const userId = await getRequestUserIdFromHeaders(request.headers);
        if (!userId) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        let body: z.infer<typeof requestSchema>;
        try {
          body = requestSchema.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request" }, { status: 400 });
        }

        const servers = await fetchAuthQuery(
          api.functions.mcpServers.getByIds,
          { serverIds: [body.mcpServerId] },
        );
        const server = servers[0];

        if (!server) {
          return Response.json(
            { error: "MCP server not found" },
            { status: 404 },
          );
        }

        let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;
        try {
          assertAllowedMcpServerUrl(server.url);
          const mcpFetch = createMcpFetch(server.url);

          client = await createMCPClient({
            name: `redux-chat-discover-${server.mcpServerId}`,
            transport: {
              type: "http",
              url: server.url,
              headers: Object.fromEntries(
                server.authHeaders.map((h) => [h.name, h.value]),
              ),
              redirect: "error",
              fetch: mcpFetch,
            },
          });

          const serverTools = await client.tools();
          const tools = Object.entries(serverTools).map(
            ([name, definition]) => ({
              name,
              description:
                "description" in definition
                  ? String(
                      (definition as { description?: string }).description ??
                        "",
                    )
                  : "",
            }),
          );

          return Response.json({ tools });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Connection failed";
          return Response.json(
            { error: message, tools: null },
            { status: 502 },
          );
        } finally {
          // eslint-disable-next-line @typescript-eslint/no-empty-function
          await client?.close().catch(() => {});
        }
      },
    },
  },
});
