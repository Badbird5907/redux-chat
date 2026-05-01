import { createFileRoute } from "@tanstack/react-router";

import { McpSettingsManager } from "@/components/settings/mcp-settings-manager";

export const Route = createFileRoute("/settings/mcp")({
  component: RouteComponent,
});

function RouteComponent() {
  return <McpSettingsManager />;
}
