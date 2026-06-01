"use client";

import type { ComponentProps } from "react";
import { useMemo, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";

import { cn } from "@redux/ui/lib/utils";

import { ReasoningContext } from "./reasoning-context";

export type ReasoningProps = ComponentProps<typeof Collapsible.Root> & {
  duration?: number;
  isStreaming?: boolean;
};

export function Reasoning({
  children,
  className,
  defaultOpen = false,
  duration,
  isStreaming = false,
  onOpenChange,
  open,
  ...props
}: ReasoningProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const resolvedOpen = isControlled ? open : internalOpen;

  const handleOpenChange: NonNullable<
    ComponentProps<typeof Collapsible.Root>["onOpenChange"]
  > = (nextOpen, eventDetails) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }

    onOpenChange?.(nextOpen, eventDetails);
  };

  const value = useMemo(
    () => ({
      duration,
      isOpen: resolvedOpen,
      isStreaming,
    }),
    [duration, resolvedOpen, isStreaming],
  );

  return (
    <ReasoningContext.Provider value={value}>
      <Collapsible.Root
        className={cn("w-full", className)}
        onOpenChange={handleOpenChange}
        open={resolvedOpen}
        {...props}
      >
        {children}
      </Collapsible.Root>
    </ReasoningContext.Provider>
  );
}

export { ReasoningContent } from "./reasoning-content";
export { ReasoningTrigger } from "./reasoning-trigger";
export type { ReasoningContentProps } from "./reasoning-content";
export type { ReasoningTriggerProps } from "./reasoning-trigger";
