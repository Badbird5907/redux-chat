"use client";

import { ArrowDownIcon } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import {
  useMessageScroller,
  useMessageScrollerScrollable,
} from "@redux/ui/components/message-scroller";
import { cn } from "@redux/ui/lib/utils";

/**
 * Floating arrow that appears just above the composer while the reader is
 * scrolled up, and jumps back to the latest message (re-engaging auto-scroll)
 * when clicked. Must be rendered inside a `MessageScrollerProvider`.
 */
export function ChatScrollToBottomButton() {
  const { end } = useMessageScrollerScrollable();
  const { scrollToEnd } = useMessageScroller();
  const visible = end;

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      aria-label="Scroll to latest"
      inert={!visible}
      onClick={() => scrollToEnd({ behavior: "smooth" })}
      className={cn(
        "border-border bg-background text-foreground hover:bg-muted hover:text-foreground rounded-full shadow-md transition-[translate,scale,opacity] duration-200",
        visible
          ? "pointer-events-auto translate-y-0 scale-100 opacity-100 ease-[cubic-bezier(0.23,1,0.32,1)]"
          : "pointer-events-none translate-y-3 scale-95 opacity-0 ease-[cubic-bezier(0.7,0,0.84,0)]",
      )}
    >
      <ArrowDownIcon />
    </Button>
  );
}
