"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@redux/ui/components/message-scroller";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@redux/ui/components/popover";
import { cn } from "@redux/ui/lib/utils";

import type { ChatTableOfContentsItem } from "./chat-table-of-contents-utils";

const ROLE_LABEL: Record<ChatTableOfContentsItem["role"], string> = {
  user: "You",
  assistant: "Assistant",
  system: "System",
};

function ChatTableOfContentsRow({
  item,
  index,
  isActive,
  isVisible,
  onSelect,
}: {
  item: ChatTableOfContentsItem;
  index: number;
  isActive: boolean;
  isVisible: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      className="group/toc-row hover:bg-muted flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
      aria-current={isActive ? "true" : undefined}
    >
      <span
        className={cn(
          "shrink-0 text-[10px] font-medium tabular-nums",
          isActive
            ? "text-foreground"
            : "text-muted-foreground/60 group-hover/toc-row:text-muted-foreground",
        )}
      >
        {index + 1}
      </span>
      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "text-[10px] font-medium tracking-wide uppercase",
            isActive ? "text-foreground/70" : "text-muted-foreground/50",
          )}
        >
          {ROLE_LABEL[item.role]}
        </span>
        <span
          className={cn(
            "truncate text-xs",
            isActive
              ? "text-foreground"
              : isVisible
                ? "text-foreground/80"
                : "text-muted-foreground",
          )}
        >
          {item.label}
        </span>
      </span>
    </button>
  );
}

export function ChatTableOfContents({
  items,
}: {
  items: ChatTableOfContentsItem[];
}) {
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility();
  const { scrollToMessage } = useMessageScroller();
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const visibleSet = useMemo(
    () => new Set(visibleMessageIds),
    [visibleMessageIds],
  );

  const activeId = currentAnchorId ?? visibleMessageIds[0] ?? null;

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openNow = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  }, [cancelClose]);

  const handleSelect = useCallback(
    (id: string) => {
      scrollToMessage(id, { align: "start" });
      cancelClose();
      setOpen(false);
    },
    [scrollToMessage, cancelClose],
  );

  if (items.length < 2) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute top-1/2 right-2 z-20 hidden -translate-y-1/2 lg:block">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Conversation outline"
              className="pointer-events-auto flex flex-col items-end gap-1.5 rounded-md p-2 outline-hidden"
              onMouseEnter={openNow}
              onMouseLeave={scheduleClose}
              onFocus={openNow}
              onBlur={scheduleClose}
            />
          }
        >
          {items.map((item) => {
            const isActive = item.id === activeId;
            return (
              <span
                key={item.id}
                className={cn(
                  "h-0.5 rounded-full transition-all duration-200",
                  isActive
                    ? "bg-foreground w-5"
                    : visibleSet.has(item.id)
                      ? "bg-foreground/50 w-4"
                      : "bg-muted-foreground/30 w-3",
                )}
              />
            );
          })}
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="center"
          sideOffset={8}
          className="pointer-events-auto max-h-[60vh] w-64 gap-0 overflow-y-auto p-1"
          onMouseEnter={openNow}
          onMouseLeave={scheduleClose}
        >
          {items.map((item, index) => (
            <ChatTableOfContentsRow
              key={item.id}
              item={item}
              index={index}
              isActive={item.id === activeId}
              isVisible={visibleSet.has(item.id)}
              onSelect={handleSelect}
            />
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
