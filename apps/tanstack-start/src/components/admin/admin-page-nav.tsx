import { Fragment } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { cn } from "@redux/ui/lib/utils";

import { MobileSidebarTrigger } from "@/components/layout/mobile-sidebar-trigger";

export type AdminBreadcrumbItem = {
  label: string;
  /** Link target for non-terminal segments; omit on the current page. */
  to?: string;
};

export function AdminPageNav({
  items,
  className,
}: {
  items: AdminBreadcrumbItem[];
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <MobileSidebarTrigger className="shrink-0" />
      <nav
        aria-label="Breadcrumb"
        className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-1 text-sm"
      >
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          const showLink =
            !isLast && item.to !== undefined && item.to.length > 0;

          return (
            <Fragment key={`${index}-${item.label}`}>
              {index > 0 ? (
                <ChevronRight
                  className="size-4 shrink-0 opacity-60"
                  aria-hidden
                />
              ) : null}
              {showLink ? (
                <Link
                  to={item.to}
                  className="hover:text-foreground font-medium transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={cn(
                    "min-w-0 max-w-[min(100%,20rem)] truncate font-medium",
                    isLast && "text-foreground",
                  )}
                >
                  {item.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </nav>
    </div>
  );
}
