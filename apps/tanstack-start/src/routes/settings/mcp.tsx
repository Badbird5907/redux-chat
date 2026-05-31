import { createFileRoute } from "@tanstack/react-router";

import { McpSettingsManager } from "@/components/settings/mcp-settings-manager";

function McpRouteComponent() {
  return <McpSettingsManager />;
}

export const Route = createFileRoute("/settings/mcp")({
  component: McpRouteComponent,
});
