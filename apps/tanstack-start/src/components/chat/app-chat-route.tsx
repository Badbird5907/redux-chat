"use client";

import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { Chat } from ".";
import { useChatRouteAdoption } from "@/components/chat/chat-route-adoption";
import { RESET_CHAT_EVENT } from "@/components/chat/reset-chat";

const ChatRouteClient = lazy(() => import("@/components/chat/route-client"));

type AppChatRouteProps = Pick<
  Parameters<typeof Chat>[0],
  "initialThreadId" | "preload"
>;

export function AppChatRoute({ initialThreadId, preload }: AppChatRouteProps) {
  const [routeSession, setRouteSession] = useState(() => ({
    key: 0,
    threadId: initialThreadId,
  }));
  const previousThreadIdRef = useRef(initialThreadId);
  const initialThreadIdRef = useRef(initialThreadId);
  const { consumeAdoptedThreadNavigation, isAdoptedThreadNavigation } =
    useChatRouteAdoption();
  const isAdoptedNavigation = isAdoptedThreadNavigation(initialThreadId);
  const isWaitingForRouteSession =
    routeSession.threadId !== initialThreadId && !isAdoptedNavigation;

  useLayoutEffect(() => {
    initialThreadIdRef.current = initialThreadId;
  }, [initialThreadId]);

  useEffect(() => {
    const handleChatReset = () => {
      // Only force a remount when we're already on the home page. When a
      // thread is active, an accompanying navigation to "/" will change
      // initialThreadId and trigger the remount in the effect below — so
      // bumping the key here would cause a redundant remount (visible as a
      // flicker of the old thread before the navigation commits).
      if (initialThreadIdRef.current !== undefined) {
        return;
      }
      setRouteSession((current) => ({
        key: current.key + 1,
        threadId: initialThreadIdRef.current,
      }));
    };

    window.addEventListener(RESET_CHAT_EVENT, handleChatReset);

    return () => {
      window.removeEventListener(RESET_CHAT_EVENT, handleChatReset);
    };
  }, []);

  useLayoutEffect(() => {
    if (previousThreadIdRef.current === initialThreadId) {
      return;
    }

    previousThreadIdRef.current = initialThreadId;

    if (consumeAdoptedThreadNavigation(initialThreadId)) {
      queueMicrotask(() => {
        setRouteSession((current) => ({
          key: current.key,
          threadId: initialThreadId,
        }));
      });
      return;
    }

    queueMicrotask(() => {
      setRouteSession((current) => ({
        key: current.key + 1,
        threadId: initialThreadId,
      }));
    });
  }, [consumeAdoptedThreadNavigation, initialThreadId]);

  if (isWaitingForRouteSession) {
    return null;
  }

  const chatPanelKey = `${routeSession.key}`;

  return (
    <div key={chatPanelKey} className="h-full">
      <Suspense fallback={null}>
        <ChatRouteClient initialThreadId={initialThreadId} preload={preload} />
      </Suspense>
    </div>
  );
}
