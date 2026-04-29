"use client";

import { AnimatePresence, motion } from "motion/react";
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

    queueMicrotask(() => {
      setRouteSessionKey((current) => current + 1);
    });
  }, [consumeAdoptedThreadNavigation, initialThreadId]);

  const chatPanelKey = `${chatResetKey}:${routeSessionKey}`;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={chatPanelKey}
        className="h-full"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1, ease: "easeOut" }}
      >
        <Suspense fallback={null}>
          <ChatRouteClient initialThreadId={initialThreadId} preload={preload} />
        </Suspense>
      </motion.div>
    </AnimatePresence>
  );
}
