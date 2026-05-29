import { createFileRoute } from "@tanstack/react-router";

import { ReasoningRouteComponent } from "./reasoning.route-component";

export const Route = createFileRoute("/reasoning")({
  component: ReasoningRouteComponent,
});
