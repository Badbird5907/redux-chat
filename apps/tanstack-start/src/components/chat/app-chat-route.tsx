"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import type { Chat } from ".";

import { RESET_CHAT_EVENT } from "@/components/chat/reset-chat";

const ChatRouteClient = lazy(() => import("@/components/chat/route-client"));

type AppChatRouteProps = Pick<
  Parameters<typeof Chat>[0],
  "initialThreadId" | "preload"
>;

export function AppChatRoute({ initialThreadId, preload }: AppChatRouteProps) {
  const [chatResetKey, setChatResetKey] = useState(0);

  useEffect(() => {
    const handleChatReset = () => {
      setChatResetKey((current) => current + 1);
    };

    window.addEventListener(RESET_CHAT_EVENT, handleChatReset);

    return () => {
      window.removeEventListener(RESET_CHAT_EVENT, handleChatReset);
    };
  }, []);

  return (
    <Suspense fallback={null}>
      <ChatRouteClient
        key={chatResetKey}
        initialThreadId={initialThreadId}
        preload={preload}
      />
    </Suspense>
  );
}
