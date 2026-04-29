"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { Chat } from ".";

import { useChatRouteAdoption } from "@/components/chat/chat-route-adoption";
import { RESET_CHAT_EVENT } from "@/components/chat/reset-chat";

const ChatRouteClient = lazy(() => import("@/components/chat/route-client"));

type AppChatRouteProps = Pick<
  Parameters<typeof Chat>[0],
  "initialThreadId" | "preload"
>;

export function AppChatRoute({ initialThreadId, preload }: AppChatRouteProps) {
  const [chatResetKey, setChatResetKey] = useState(0);
  const [routeSessionKey, setRouteSessionKey] = useState(0);
  const previousThreadIdRef = useRef(initialThreadId);
  const { consumeAdoptedThreadNavigation } = useChatRouteAdoption();

  useEffect(() => {
    const handleChatReset = () => {
      setChatResetKey((current) => current + 1);
    };

    window.addEventListener(RESET_CHAT_EVENT, handleChatReset);

    return () => {
      window.removeEventListener(RESET_CHAT_EVENT, handleChatReset);
    };
  }, []);

  useEffect(() => {
    if (previousThreadIdRef.current === initialThreadId) {
      return;
    }

    previousThreadIdRef.current = initialThreadId;

    if (consumeAdoptedThreadNavigation(initialThreadId)) {
      return;
    }

    setRouteSessionKey((current) => current + 1);
  }, [initialThreadId]);

  return (
    <Suspense fallback={null}>
      <ChatRouteClient
        key={`${chatResetKey}:${routeSessionKey}`}
        initialThreadId={initialThreadId}
        preload={preload}
      />
    </Suspense>
  );
}
