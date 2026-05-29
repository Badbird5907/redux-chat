import { createFileRoute } from "@tanstack/react-router";

import { HotkeysRouteComponent } from "./hotkeys.route-component";

export const Route = createFileRoute("/settings/hotkeys")({
  component: HotkeysRouteComponent,
});
