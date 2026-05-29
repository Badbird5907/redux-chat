import { createFileRoute } from "@tanstack/react-router";

import { ComponentsRouteComponent } from "./components.route-component";

export const Route = createFileRoute("/components")({
  component: ComponentsRouteComponent,
});
