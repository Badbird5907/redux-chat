"use client";

import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { BrainIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@redux/ui/lib/utils";

import { Shimmer } from "@/components/ai/shimmer";

interface ReasoningContextValue {
  duration?: number;
  isOpen: boolean;
  isStreaming: boolean;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const context = useContext(ReasoningContext);

  if (!context) {
    throw new Error("Reasoning components must be used within <Reasoning />.");
  }

  return context;
}

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

export type ReasoningTriggerProps = ComponentProps<
  typeof Collapsible.Trigger
> & {
  getThinkingMessage?: (isStreaming: boolean, duration?: number) => ReactNode;
};

export function ReasoningTrigger({
  children,
  className,
  getThinkingMessage,
  ...props
}: ReasoningTriggerProps) {
  const { duration, isOpen, isStreaming } = useReasoningContext();
  const label =
    children ??
    getThinkingMessage?.(isStreaming, duration) ??
    getDefaultReasoningLabel(isStreaming, duration);

  return (
    <Collapsible.Trigger
      className={cn(
        "focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md px-0 py-1.5 text-left text-sm font-medium outline-none focus-visible:ring-[3px]",
        className,
      )}
      {...props}
    >
      <span className="text-muted-foreground flex items-center gap-2">
        {/* {isStreaming && <LoaderCircleIcon className="size-4 animate-spin" />} */}
        <BrainIcon className="size-4" />
        {isStreaming && typeof label === "string" ? (
          <Shimmer as="span" className="text-sm" duration={1.8}>
            {label}
          </Shimmer>
        ) : (
          <span>{label}</span>
        )}
      </span>
      <ChevronDownIcon
        className={cn(
          "text-muted-foreground size-4 transition-transform",
          isOpen && "rotate-180",
        )}
      />
    </Collapsible.Trigger>
  );
}

export type ReasoningContentProps = ComponentProps<typeof Collapsible.Panel>;

export function ReasoningContent({
  children,
  className,
  ...props
}: ReasoningContentProps) {
  return (
    <Collapsible.Panel
      className="data-starting-style:data-open:animate-accordion-down data-ending-style:data-closed:animate-accordion-up overflow-hidden"
      keepMounted
      {...props}
    >
      <div
        className={cn(
          "text-muted-foreground px-0 pt-2 pb-0 text-sm whitespace-pre-wrap",
          className,
        )}
      >
        {children}
      </div>
    </Collapsible.Panel>
  );
}

function getDefaultReasoningLabel(isStreaming: boolean, duration?: number) {
  if (isStreaming) {
    return "Thinking...";
  }

  if (duration && duration >= 1000) {
    const seconds = Math.max(1, Math.round(duration / 1000));
    return `Thought for ${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  return "Thought for a second";
  // return "Thought process";
}
