import { createFileRoute } from "@tanstack/react-router";

import { SecurityRouteComponent } from "./security.route-component";

export const Route = createFileRoute("/settings/security")({
  component: SecurityRouteComponent,
});
