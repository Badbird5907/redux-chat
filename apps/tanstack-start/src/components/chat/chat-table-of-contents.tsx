"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import {
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from "@redux/ui/components/message-scroller";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@redux/ui/components/popover";
import { cn } from "@redux/ui/lib/utils";

import type { ChatTableOfContentsItem } from "./chat-table-of-contents-utils";

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
    </button>
  );
}

export function ChatTableOfContents({
  items,
}: {
  items: ChatTableOfContentsItem[];
}) {
  const { currentAnchorId, visibleMessageIds } = useMessageScrollerVisibility();
  const { end: canScrollToEnd } = useMessageScrollerScrollable();
  const { scrollToMessage } = useMessageScroller();
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const visibleSet = useMemo(
    () => new Set(visibleMessageIds),
    [visibleMessageIds],
  );

  const itemIds = useMemo(() => new Set(items.map((item) => item.id)), [items]);

  // The scroller reports `currentAnchorId` as the turn whose top has reached the
  // top of the viewport, so a short final message that is fully on screen never
  // becomes the anchor and the previous turn stays highlighted. Only promote the
  // last turn once the reader is actually at the bottom of the thread (the
  // scroller's own end-edge signal), instead of whenever it merely intersects the
  // viewport — otherwise a turn peeking under the composer is wrongly activated.
  const lastItem = items.at(-1);
  const activeId =
    !canScrollToEnd && lastItem
      ? lastItem.id
      : (currentAnchorId ??
        visibleMessageIds.find((id) => itemIds.has(id)) ??
        null);

  // The visibility observer ignores the top "previous item peek" band, so a turn
  // whose tail sits up there (e.g. the second-to-last turn once the reader is at
  // the bottom) is reported as not visible even though it is on screen. On-screen
  // turns are contiguous, running from the top-anchored turn down to the active
  // turn, so treat that whole span — plus anything the observer reports — as
  // visible instead of the raw observer set.
  let minVisibleIndex = -1;
  let maxVisibleIndex = -1;
  items.forEach((item, index) => {
    if (
      visibleSet.has(item.id) ||
      item.id === currentAnchorId ||
      item.id === activeId
    ) {
      if (minVisibleIndex === -1) {
        minVisibleIndex = index;
      }
      maxVisibleIndex = index;
    }
  });
  const isItemVisible = (index: number) =>
    minVisibleIndex !== -1 &&
    index >= minVisibleIndex &&
    index <= maxVisibleIndex;

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
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-label="Conversation outline"
              className="pointer-events-auto flex flex-col items-end gap-1.5 rounded-md p-2 outline-hidden"
              onMouseEnter={openNow}
              onMouseLeave={scheduleClose}
            />
          }
        >
          {items.map((item, index) => {
            const isActive = item.id === activeId;
            return (
              <span
                key={item.id}
                className={cn(
                  "h-0.5 rounded-full transition-all duration-200",
                  isActive
                    ? "bg-foreground w-5"
                    : isItemVisible(index)
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
              isVisible={isItemVisible(index)}
              onSelect={handleSelect}
            />
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
