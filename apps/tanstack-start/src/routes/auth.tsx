import { createFileRoute } from "@tanstack/react-router";

import { AuthRouteComponent } from "./auth.route-component";

export const Route = createFileRoute("/auth")({
  component: AuthRouteComponent,
});
