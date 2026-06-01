"use client";

import type { ComponentProps, ReactNode } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { BrainIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "@redux/ui/lib/utils";

import { Shimmer } from "@/components/ai/shimmer";
import { useReasoningContext } from "./reasoning-context";

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

function getDefaultReasoningLabel(isStreaming: boolean, duration?: number) {
  if (isStreaming) {
    return "Thinking...";
  }

  if (duration === undefined) {
    return "Thought";
  }

  const seconds = Math.max(0, Math.round(duration / 1000));

  if (seconds < 1) {
    return "Thought for less than a second";
  }

  if (seconds < 60) {
    return `Thought for ${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (remainingSeconds === 0) {
    return `Thought for ${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  return `Thought for ${minutes} minute${minutes === 1 ? "" : "s"} ${remainingSeconds} second${remainingSeconds === 1 ? "" : "s"}`;
}
