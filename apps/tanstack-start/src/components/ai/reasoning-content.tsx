"use client";

import type { ComponentProps } from "react";
import { Collapsible } from "@base-ui/react/collapsible";

import { cn } from "@redux/ui/lib/utils";

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
