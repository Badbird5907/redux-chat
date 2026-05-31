import { createFileRoute, redirect } from "@tanstack/react-router";

import { fetchAdminDashboardAccess } from "@/server/admin/ensure-admin-access";
import { getSidebarConfig } from "@/server/cookie";
import { AdminLayout } from "./admin.route-component";

export const Route = createFileRoute("/admin")({
  beforeLoad: async ({ context }) => {
    if (!context.isAuthenticated) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/auth/sign-in" });
    }

    const sidebarConfig = await getSidebarConfig();
    const [openState, savedWidth] = sidebarConfig?.split(":") ?? [];
    const defaultOpen =
      openState !== undefined ? openState === "true" : undefined;
    const defaultWidth = savedWidth;

    const access = await fetchAdminDashboardAccess();
    if (!access.isAdmin) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/" });
    }

    return {
      defaultOpen,
      defaultWidth,
    };
  },
  head: () => ({
    meta: [{ title: "Admin | Redux Chat" }],
  }),
  component: AdminLayout,
});
