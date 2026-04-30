import { createFileRoute } from "@tanstack/react-router";

import { InstructionsManager } from "@/components/settings/instructions-manager";

export const Route = createFileRoute("/settings/instructions")({
  component: RouteComponent,
});

function RouteComponent() {
  return <InstructionsManager />;
}
