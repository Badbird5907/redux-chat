import { createFileRoute } from "@tanstack/react-router";

import { InstructionsManager } from "@/components/settings/instructions-manager";

function InstructionsRouteComponent() {
  return <InstructionsManager />;
}

export const Route = createFileRoute("/settings/instructions")({
  component: InstructionsRouteComponent,
});
