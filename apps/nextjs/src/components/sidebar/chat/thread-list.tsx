"use client";
"use no memo"; // Opt out of React Compiler - TanStack Virtual uses flushSync internally

import { useRef, useMemo, useState, useEffect } from "react";
import type { VirtualItem } from "@tanstack/react-virtual";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePaginatedQuery } from "convex/react";
import { api } from "@redux/backend/convex/_generated/api";
import { SidebarGroup, SidebarGroupContent } from "@redux/ui/components/sidebar";
import { Skeleton } from "@redux/ui/components/skeleton";
import Spinner from "@redux/ui/components/spinner";
import ChatThreadSidebarItem from "./chat-thread";

type Thread = {
  _id: string;
  name: string;
  timestamp: number;
  _creationTime: number;
};

type GroupedItem =
  | { type: "header"; label: string; key: string }
  | { type: "thread"; thread: Thread; key: string };

function getDateGroup(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);

  // Reset time to midnight for comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateOnly >= today) {
    return "Today";
  } else if (dateOnly >= yesterday) {
    return "Yesterday";
  } else if (dateOnly >= weekAgo) {
    return "Past Week";
  } else if (dateOnly >= monthAgo) {
    return "Past Month";
  } else {
    return "Older";
  }
}

function groupThreads(threads: Thread[]): GroupedItem[] {
  const items: GroupedItem[] = [];
  let currentGroup = "";

  for (const thread of threads) {
    const group = getDateGroup(thread.timestamp);
    if (group !== currentGroup) {
      currentGroup = group;
      items.push({ type: "header", label: group, key: `header-${group}` });
    }
    items.push({ type: "thread", thread, key: thread._id });
  }

  return items;
}

const INITIAL_ITEMS = 75;
const LOAD_MORE_ITEMS = 20;
const ITEM_GAP = 4; // Vertical spacing between thread items
const ITEM_HEIGHT = 32 + ITEM_GAP; // Height of each thread item including gap
const HEADER_HEIGHT = 28; // Height of group headers

export default function ThreadList() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.threads.getThreads,
    {},
    { initialNumItems: INITIAL_ITEMS }
  );

  const parentRef = useRef<HTMLDivElement>(null);

  const groupedItems = useMemo(() => {
    return groupThreads(results as Thread[]);
  }, [results]);

  const [virtualState, setVirtualState] = useState<{
    items: VirtualItem[];
    totalSize: number;
  }>({ items: [], totalSize: 0 });

  const loadMoreRef = useRef(loadMore);
  const statusRef = useRef(status);
  const groupedItemsLengthRef = useRef(groupedItems.length);
  
  loadMoreRef.current = loadMore;
  statusRef.current = status;
  groupedItemsLengthRef.current = groupedItems.length;

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: status === "CanLoadMore" ? groupedItems.length + 1 : groupedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      if (index >= groupedItems.length) return ITEM_HEIGHT; // Loader row
      const item = groupedItems[index];
      return item?.type === "header" ? HEADER_HEIGHT : ITEM_HEIGHT;
    },
    overscan: 20,
    initialRect: { height: 600, width: 200 },
    onChange: (instance) => {
      const items = instance.getVirtualItems();
      const totalSize = instance.getTotalSize();
      
      // Update state with virtual items
      setVirtualState({ items, totalSize });
      
      const lastItem = items[items.length - 1];
      if (!lastItem) return;
      
      if (
        lastItem.index >= groupedItemsLengthRef.current - 1 &&
        statusRef.current === "CanLoadMore"
      ) {
        loadMoreRef.current(LOAD_MORE_ITEMS);
      }
    },
  });

  useEffect(() => {
    queueMicrotask(() => {
      setVirtualState({
        items: virtualizer.getVirtualItems(),
        totalSize: virtualizer.getTotalSize(),
      });
    });
  }, [virtualizer]);

  const { items, totalSize } = virtualState;

  if (status === "LoadingFirstPage") {
    return (
      <SidebarGroup>
        <SidebarGroupContent className="px-2">
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

  return (
    <SidebarGroup className="flex-1 min-h-0">
      <SidebarGroupContent className="h-full">
        <div
          ref={parentRef}
          className="h-full overflow-y-auto scrollbar-none"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          <div
            style={{
              height: `${totalSize}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {items.map((virtualRow) => {
              const isLoaderRow = virtualRow.index >= groupedItems.length;

              if (isLoaderRow) {
                return (
                  <div
                    key="loader"
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex items-center justify-center px-2"
                  >
                    {status === "CanLoadMore" ? <Spinner /> : null}
                  </div>
                );
              }

              const item = groupedItems[virtualRow.index];

              if (!item) return null;

              if (item.type === "header") {
                return (
                  <div
                    key={item.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                    className="flex items-center px-2"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {item.label}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={item.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingTop: `${ITEM_GAP / 2}px`,
                    paddingBottom: `${ITEM_GAP / 2}px`,
                  }}
                  className="px-1"
                >
                  <ChatThreadSidebarItem
                    threadId={item.thread._id}
                    threadName={item.thread.name}
                    timestamp={item.thread.timestamp}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
