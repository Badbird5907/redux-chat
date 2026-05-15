import type { ComponentProps } from "react";

import { SidebarTrigger } from "@redux/ui/components/sidebar";
import { cn } from "@redux/ui/lib/utils";

/** Sidebar open control shown in page content on small screens only (md+ uses the sidebar chrome). */
export function MobileSidebarTrigger({
  className,
  ...props
}: ComponentProps<typeof SidebarTrigger>) {
  return (
    <SidebarTrigger
      className={cn("shrink-0 md:hidden", className)}
      {...props}
    />
  );
}
