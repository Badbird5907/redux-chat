import { createFileRoute } from "@tanstack/react-router";

import { ForgotPasswordRouteComponent } from "./auth.forgot-password.route-component";

export const Route = createFileRoute("/auth/forgot-password")({
  component: ForgotPasswordRouteComponent,
});
