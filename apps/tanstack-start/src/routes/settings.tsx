import { createFileRoute } from "@tanstack/react-router";

import { getSidebarConfig } from "@/server/cookie";
import { SettingsLayout } from "./settings.route-component";

export const Route = createFileRoute("/settings")({
  beforeLoad: async () => {
    const sidebarConfig = await getSidebarConfig();
    const [openState, savedWidth] = sidebarConfig?.split(":") ?? [];
    const defaultOpen =
      openState !== undefined ? openState === "true" : undefined;
    const defaultWidth = savedWidth;

    return {
      defaultOpen,
      defaultWidth,
    };
  },
  component: SettingsLayout,
});
