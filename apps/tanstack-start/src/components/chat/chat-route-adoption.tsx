"use client";

import type { ReactNode } from "react";
import { createContext, use, useCallback, useMemo, useState } from "react";

interface ChatRouteAdoptionContextValue {
  markAdoptedThreadNavigation: (threadId: string) => void;
  consumeAdoptedThreadNavigation: (threadId: string | undefined) => boolean;
  isAdoptedThreadNavigation: (threadId: string | undefined) => boolean;
}

const ChatRouteAdoptionContext = createContext<
  ChatRouteAdoptionContextValue | undefined
>(undefined);

export function ChatRouteAdoptionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [pendingThreadId, setPendingThreadId] = useState<string | undefined>(
    undefined,
  );

  const markAdoptedThreadNavigation = useCallback((threadId: string) => {
    setPendingThreadId(threadId);
  }, []);

  const isAdoptedThreadNavigation = useCallback(
    (threadId: string | undefined) =>
      Boolean(threadId && pendingThreadId === threadId),
    [pendingThreadId],
  );

  const consumeAdoptedThreadNavigation = useCallback(
    (threadId: string | undefined) => {
      if (!isAdoptedThreadNavigation(threadId)) {
        return false;
      }

      setPendingThreadId(undefined);
      return true;
    },
    [isAdoptedThreadNavigation],
  );

  const value = useMemo(
    () => ({
      markAdoptedThreadNavigation,
      consumeAdoptedThreadNavigation,
      isAdoptedThreadNavigation,
    }),
    [
      consumeAdoptedThreadNavigation,
      isAdoptedThreadNavigation,
      markAdoptedThreadNavigation,
    ],
  );

  return (
    <ChatRouteAdoptionContext.Provider value={value}>
      {children}
    </ChatRouteAdoptionContext.Provider>
  );
}

export function useChatRouteAdoption() {
  const context = use(ChatRouteAdoptionContext);

  if (!context) {
    throw new Error(
      "useChatRouteAdoption must be used within ChatRouteAdoptionProvider",
    );
  }

  return context;
}
