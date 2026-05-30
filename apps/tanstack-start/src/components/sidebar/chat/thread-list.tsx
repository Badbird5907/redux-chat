"use no memo";

// Opt out of React Compiler - TanStack Virtual uses flushSync internally
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePaginatedQuery } from "convex/react";

import { api } from "@redux/backend/convex/_generated/api";
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@redux/ui/components/sidebar";
import { Skeleton } from "@redux/ui/components/skeleton";
import Spinner from "@redux/ui/components/spinner";

import { authClient } from "@/lib/auth/client";
import ChatThreadSidebarItem from "./chat-thread";

type Thread = {
  threadId: string;
  name: string;
  titleSource?: "user" | "generated";
  titleGeneratedAt?: number;
  timestamp: number;
  status: "generating" | "completed";
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

  const dateOnly = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

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
      items.push({
        type: "header",
        label: group,
        key: `header-${group}-${thread.threadId}`,
      });
    }
    items.push({ type: "thread", thread, key: thread.threadId });
  }

  return items;
}

const INITIAL_ITEMS = 75;
const LOAD_MORE_ITEMS = 20;
const ITEM_GAP = 4; // Vertical spacing between thread items
const ITEM_HEIGHT = 32 + ITEM_GAP; // Height of each thread item including gap
const HEADER_HEIGHT = 28; // Height of group headers
const subscribeToClientSnapshot = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function ThreadList() {
  const { data: session, isPending } = authClient.useSession();
  const mounted = useSyncExternalStore(
    subscribeToClientSnapshot,
    getClientSnapshot,
    getServerSnapshot,
  );

  const { results, status, loadMore } = usePaginatedQuery(
    api.functions.threads.getThreads,
    mounted && session ? {} : "skip",
    { initialNumItems: INITIAL_ITEMS },
  );

  const parentRef = useRef<HTMLDivElement>(null);

  const groupedItems = useMemo(() => {
    return groupThreads(results);
  }, [results]);

  const lastLoadMoreCountRef = useRef<number | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count:
      status === "CanLoadMore" ? groupedItems.length + 1 : groupedItems.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => {
      if (index >= groupedItems.length) {
        return "loader";
      }

      return groupedItems[index]?.key ?? index;
    },
    estimateSize: (index) => {
      if (index >= groupedItems.length) return ITEM_HEIGHT; // Loader row
      const item = groupedItems[index];
      return item?.type === "header" ? HEADER_HEIGHT : ITEM_HEIGHT;
    },
    overscan: 20,
    initialRect: { height: 600, width: 200 },
  });

  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  useEffect(() => {
    if (!mounted || status !== "CanLoadMore") return;

    const lastItem = items[items.length - 1];
    if (!lastItem || lastItem.index < groupedItems.length - 1) return;
    if (lastLoadMoreCountRef.current === groupedItems.length) return;

    lastLoadMoreCountRef.current = groupedItems.length;
    loadMore(LOAD_MORE_ITEMS);
  }, [groupedItems.length, items, loadMore, mounted, status]);

  if (!mounted || isPending) {
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

  if (!session) {
    // TODO: in the future, if we have a free non-signed in tier, we can keep a temp thread list here
    return (
      <SidebarGroup>
        <SidebarGroupContent className="px-2 pt-4">
          <div className="flex items-center justify-center px-2">
            <p className="text-muted-foreground text-sm">
              Sign in to view your threads
            </p>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  }

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
    <SidebarGroup className="min-h-0 flex-1">
      <SidebarGroupContent className="h-full">
        <div
          ref={parentRef}
          className="scrollbar-none h-full overflow-y-auto"
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
            {groupedItems.length === 0 && (
              // no threads found
              <div className="flex items-center justify-center px-2">
                <p className="text-muted-foreground text-sm">
                  No threads found. Start a new chat!
                </p>
              </div>
            )}
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
                    <span className="text-muted-foreground text-xs font-medium">
                      {item.label}
                    </span>
                  </div>
                );
              }

              return (
                <div
                  key={item.key}
                  style={{
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingTop: `${ITEM_GAP / 2}px`,
                    paddingBottom: `${ITEM_GAP / 2}px`,
                  }}
                  className="absolute top-0 left-0 w-full px-1"
                >
                  <ChatThreadSidebarItem
                    threadId={item.thread.threadId}
                    threadName={item.thread.name}
                    titleSource={item.thread.titleSource}
                    titleGeneratedAt={item.thread.titleGeneratedAt}
                    timestamp={item.thread.timestamp}
                    status={item.thread.status}
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
