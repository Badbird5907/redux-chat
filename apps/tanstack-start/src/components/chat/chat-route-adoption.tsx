"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";

interface ChatRouteAdoptionContextValue {
  markAdoptedThreadNavigation: (threadId: string) => void;
  consumeAdoptedThreadNavigation: (threadId: string | undefined) => boolean;
}

const ChatRouteAdoptionContext = createContext<
  ChatRouteAdoptionContextValue | undefined
>(undefined);

export function ChatRouteAdoptionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pendingThreadIdRef = useRef<string | undefined>(undefined);

  const markAdoptedThreadNavigation = useCallback((threadId: string) => {
    pendingThreadIdRef.current = threadId;
  }, []);

  const consumeAdoptedThreadNavigation = useCallback(
    (threadId: string | undefined) => {
      if (!threadId || pendingThreadIdRef.current !== threadId) {
        return false;
      }

      pendingThreadIdRef.current = undefined;
      return true;
    },
    [],
  );

  const value = useMemo(
    () => ({
      markAdoptedThreadNavigation,
      consumeAdoptedThreadNavigation,
    }),
    [consumeAdoptedThreadNavigation, markAdoptedThreadNavigation],
  );

  return (
    <ChatRouteAdoptionContext.Provider value={value}>
      {children}
    </ChatRouteAdoptionContext.Provider>
  );
}

export function useChatRouteAdoption() {
  const context = useContext(ChatRouteAdoptionContext);

  if (!context) {
    throw new Error(
      "useChatRouteAdoption must be used within ChatRouteAdoptionProvider",
    );
  }

  return context;
}
