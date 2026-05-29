import { createFileRoute } from "@tanstack/react-router";

import { McpRouteComponent } from "./mcp.route-component";

export const Route = createFileRoute("/settings/mcp")({
  component: McpRouteComponent,
});
