import { createFileRoute } from "@tanstack/react-router";

import { InstructionsRouteComponent } from "./instructions.route-component";

export const Route = createFileRoute("/settings/instructions")({
  component: InstructionsRouteComponent,
});
