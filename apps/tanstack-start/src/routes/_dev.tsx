import { Outlet, createFileRoute } from "@tanstack/react-router";
import { env } from "@/env";

export const Route = createFileRoute("/_dev")({
  beforeLoad: async () => {
    if (env.NODE_ENV !== "development") {
      throw new Response("Not Found", { status: 404 });
    }
    return {};
  },
  component: DevLayout,
});

function DevLayout() {
  return <Outlet />;
}