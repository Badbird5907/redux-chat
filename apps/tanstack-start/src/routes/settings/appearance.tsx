import { createFileRoute } from "@tanstack/react-router";

import { AppearanceRouteComponent } from "./appearance.route-component";

export const Route = createFileRoute("/settings/appearance")({
  component: AppearanceRouteComponent,
});
