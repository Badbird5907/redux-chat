"use client";

import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva } from "class-variance-authority";
import { ExternalLinkIcon } from "lucide-react";

import { cn } from "@redux/ui/lib/utils";

const tabsTriggerClassName = cn(
  "text-foreground/60 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:text-muted-foreground dark:hover:text-foreground relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-1.5 py-0.5 text-sm font-medium whitespace-nowrap transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-[variant=default]/tabs-list:data-active:shadow-sm group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
  "data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
  "after:bg-foreground after:absolute after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
);

type TabValue = string | number | null;
type TabsValueChangeDetails = TabsPrimitive.Root.ChangeEventDetails;
type TabsValueChangeHandler = (
  value: TabValue,
  eventDetails: TabsValueChangeDetails,
) => void;

export type TabsProps = Omit<
  TabsPrimitive.Root.Props,
  "value" | "defaultValue" | "onValueChange"
> & {
  value?: TabValue | undefined;
  defaultValue?: TabValue | undefined;
  onValueChange?: TabsValueChangeHandler | undefined;
  /**
   * When true, the active tab value is synced to `?<queryParamKey>=…` via
   * `history.replaceState` on tab changes (no extra history entries).
   *
   * **Uncontrolled:** the tab from the query string overrides `defaultValue` after
   * mount (reload / open with `?tab=…`).
   *
   * **Controlled:** initialize `value` from the route search params yourself on
   * the server/client; switching tabs updates the URL when the inner trigger
   * fires `onValueChange`. Browser back/forward calls `onValueChange` when the
   * query param differs from `value` (needs a handler that updates React state).
   */
  queryParam?: boolean | undefined;
  /** URL query key used when `queryParam` is true. @default "tab" */
  queryParamKey?: string | undefined;
};

function readTabFromSearch(key: string): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(key);
  return raw !== null && raw !== "" ? raw : null;
}

function writeTabToSearch(key: string, value: TabValue | undefined) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (value === undefined || value === null || value === "") {
    url.searchParams.delete(key);
  } else {
    url.searchParams.set(key, String(value));
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function Tabs({
  className,
  orientation = "horizontal",
  queryParam = false,
  queryParamKey = "tab",
  value: valueProp,
  defaultValue,
  onValueChange,
  ...props
}: TabsProps) {
  const isControlled = valueProp !== undefined;
  const [internalValue, setInternalValue] = React.useState<
    TabValue | undefined
  >(() => {
    const initialValue = defaultValue !== undefined ? defaultValue : 0;
    if (!queryParam || isControlled) return initialValue;
    const fromUrl = readTabFromSearch(queryParamKey);
    return fromUrl === null
      ? initialValue
      : coerceTabValue(fromUrl, initialValue);
  });

  React.useEffect(() => {
    if (!queryParam) return;
    if (isControlled) {
      const onPopState = () => {
        const fromUrl = readTabFromSearch(queryParamKey);
        if (fromUrl === null) return;
        const next = coerceTabValue(fromUrl, valueProp);
        if (String(next) === String(valueProp)) return;
        onValueChange?.(next, POPSTATE_CHANGE_DETAILS);
      };
      window.addEventListener("popstate", onPopState);
      return () => window.removeEventListener("popstate", onPopState);
    }
    const onPopState = () => {
      const fromUrl = readTabFromSearch(queryParamKey);
      if (fromUrl === null) return;
      setInternalValue((current: TabValue | undefined) =>
        coerceTabValue(fromUrl, current),
      );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [queryParam, queryParamKey, isControlled, valueProp, onValueChange]);

  const handleValueChange = React.useCallback(
    (next, details) => {
      const tabValue = normalizeTabValue(next);
      if (!isControlled) {
        setInternalValue(tabValue);
      }
      if (queryParam) {
        writeTabToSearch(queryParamKey, tabValue);
      }
      onValueChange?.(tabValue, details);
    },
    [isControlled, onValueChange, queryParam, queryParamKey],
  ) satisfies NonNullable<TabsPrimitive.Root.Props["onValueChange"]>;

  const rootControlledProps = queryParam
    ? ({
        value: isControlled ? valueProp : internalValue,
        onValueChange: handleValueChange,
      } as const)
    : isControlled
      ? ({
          value: valueProp,
          onValueChange,
        } as const)
      : ({
          ...(defaultValue !== undefined ? { defaultValue } : {}),
          onValueChange,
        } as const);

  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className,
      )}
      {...props}
      {...rootControlledProps}
    />
  );
}

/** Coerce URL string to match prior value type when possible (e.g. numeric tab values). */
function coerceTabValue(
  fromUrl: string,
  fallback: TabValue | undefined,
): TabValue {
  if (typeof fallback === "number") {
    const n = Number(fromUrl);
    if (!Number.isNaN(n)) return n;
  }
  return fromUrl;
}

function normalizeTabValue(value: unknown): TabValue {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    value === null
  ) {
    return value;
  }
  if (
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    typeof value === "symbol"
  ) {
    return String(value);
  }
  return null;
}

const noop = () => undefined;

const POPSTATE_CHANGE_DETAILS = {
  reason: "none",
  event: new Event("popstate"),
  cancel: noop,
  allowPropagation: noop,
  isCanceled: false,
  isPropagationAllowed: true,
  trigger: undefined,
  activationDirection: "none",
} as unknown as TabsValueChangeDetails;

const tabsListVariants = cva(
  "group/tabs-list text-muted-foreground inline-flex w-fit items-center justify-center rounded-lg p-[3px] group-data-[orientation=horizontal]/tabs:h-8 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function TabsList({
  className,
  variant = "default",
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(tabsTriggerClassName, className)}
      {...props}
    />
  );
}

type ExternalTabsTriggerProps = Omit<React.ComponentProps<"a">, "href"> & {
  href: string;
};

function ExternalTabsTrigger({
  className,
  href,
  children,
  target = "_blank",
  rel = "noopener noreferrer",
  ...props
}: ExternalTabsTriggerProps) {
  return (
    <a
      data-slot="tabs-external-trigger"
      href={href}
      target={target}
      rel={rel}
      className={cn(tabsTriggerClassName, className)}
      {...props}
    >
      {children}
      <ExternalLinkIcon aria-hidden data-icon="inline-end" />
    </a>
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  ExternalTabsTrigger,
  TabsContent,
  tabsListVariants,
};
