import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/")({
  ssr: false,
  component: RouteComponent,
});

function RouteComponent() {
  return null;
}
