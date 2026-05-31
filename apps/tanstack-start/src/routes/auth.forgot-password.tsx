import { createFileRoute } from "@tanstack/react-router";

function ForgotPasswordRouteComponent() {
  return <div>Hello "/auth/forgot-password"!</div>;
}

export const Route = createFileRoute("/auth/forgot-password")({
  component: ForgotPasswordRouteComponent,
});
