import { Star } from "lucide-react";
import { AnimatePresence, LayoutGroup, m } from "motion/react";

import { cn } from "@redux/ui/lib/utils";

import type { ModelSelectorState } from "./use-model-selector-state";
import {
  panelSpring,
  sidebarAsideVariants,
  sidebarRailItemVariants,
} from "./constants";
import { ProviderGlyph } from "./provider-glyph";

type SidebarProps = Pick<
  ModelSelectorState,
  | "isSearchActive"
  | "sidebarRailLayoutGroupId"
  | "sidebarProviders"
  | "activeSidebar"
  | "navColumn"
  | "sidebarNavIndex"
  | "setActiveSidebar"
  | "setSidebarNavIndex"
  | "setNavColumn"
>;

export function ModelSelectorSidebarRail(props: SidebarProps) {
  const {
    isSearchActive,
    sidebarRailLayoutGroupId,
    sidebarProviders,
    activeSidebar,
    navColumn,
    sidebarNavIndex,
    setActiveSidebar,
    setSidebarNavIndex,
    setNavColumn,
  } = props;
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {!isSearchActive ? (
        <m.aside
          key="model-selector-sidebar"
          variants={sidebarAsideVariants}
          initial="closed"
          animate="open"
          exit="closed"
          className="border-border/60 flex shrink-0 flex-col items-center overflow-hidden border-r pt-2.5 pb-2"
          style={{ minWidth: 0 }}
          data-model-selector-sidebar
        >
          <div
            className="scrollbar-none flex min-h-0 w-14 flex-col items-center overflow-y-auto"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
          >
            <m.button
              type="button"
              title="Favorite models"
              variants={sidebarRailItemVariants}
              whileTap={{ scale: 0.92 }}
              transition={panelSpring}
              onClick={() => {
                setActiveSidebar("favorites");
                setSidebarNavIndex(0);
                setNavColumn("sidebar");
              }}
              className={cn(
                "mb-[9px] flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors outline-none",
                navColumn === "sidebar" &&
                  sidebarNavIndex === 0 &&
                  "ring-primary/45 ring-offset-background ring-2 ring-offset-2",
                activeSidebar === "favorites"
                  ? "bg-muted text-amber-600 dark:text-amber-400"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Star
                className={cn(
                  "size-5",
                  activeSidebar === "favorites" && "fill-current",
                )}
              />
            </m.button>
            <m.div
              variants={sidebarRailItemVariants}
              className="bg-border/60 mb-1.5 h-px w-8 shrink-0"
              aria-hidden
            />
            <LayoutGroup id={sidebarRailLayoutGroupId}>
              <div className="flex w-full flex-col items-center gap-0.5">
                {sidebarProviders.map((p, providerIdx) => (
                  <m.button
                    key={p.slug}
                    type="button"
                    title={p.name}
                    variants={sidebarRailItemVariants}
                    whileTap={{ scale: 0.92 }}
                    transition={panelSpring}
                    onClick={() => {
                      setActiveSidebar(p.slug);
                      setSidebarNavIndex(providerIdx + 1);
                      setNavColumn("sidebar");
                    }}
                    className={cn(
                      "relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors outline-none",
                      navColumn === "sidebar" &&
                        sidebarNavIndex === providerIdx + 1 &&
                        "ring-primary/45 ring-offset-background ring-2 ring-offset-2",
                      activeSidebar === p.slug
                        ? "bg-muted text-muted-foreground"
                        : "hover:bg-muted",
                    )}
                  >
                    <ProviderGlyph maker={p.slug} className="size-5" />
                    {activeSidebar === p.slug ? (
                      <m.span
                        layoutId="model-selector-sidebar-provider-marker"
                        className="bg-primary absolute top-1.5 right-0 h-8 w-0.5 rounded-l"
                        transition={panelSpring}
                        aria-hidden
                      />
                    ) : null}
                  </m.button>
                ))}
              </div>
            </LayoutGroup>
          </div>
        </m.aside>
      ) : null}
    </AnimatePresence>
  );
}
