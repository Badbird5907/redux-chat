"use client";

import type { UIMessage } from "ai";
import { useCallback, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "@tanstack/react-router";
import { DefaultChatTransport } from "ai";

import { ChatInput } from "@/components/chat/input";
import { useChatRouteAdoption } from "./chat-route-adoption";
import { SignedCidProvider } from "./client-id";
import { useChatSettings } from "./use-chat-settings";
import { useStableClientId } from "./use-stable-client-id";

const EMPTY_CONVEX_MESSAGES: UIMessage[] = [];

function ProjectChatInput({ chatProjectId }: { chatProjectId: string }) {
  const router = useRouter();
  const chatSessionId = useStableClientId();
  const { markAdoptedThreadNavigation } = useChatRouteAdoption();
  const {
    settings,
    isReady: settingsReady,
    setModel,
    updateSettings,
  } = useChatSettings();

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
      }),
    [],
  );

  const { messages, status, sendMessage, setMessages } = useChat({
    id: chatSessionId,
    transport,
    onError: (error) => {
      console.error("Project chat input error:", error);
    },
  });

  const handleThreadIdChange = useCallback(
    (id: string) => {
      markAdoptedThreadNavigation(id);
      void router.navigate({
        to: "/chat/$id",
        params: { id },
        replace: true,
      });
    },
    [markAdoptedThreadNavigation, router],
  );

  const sendMessageWithTracking = useCallback(
    (
      message: {
        text: string;
        messageId?: string;
        metadata?: Record<string, unknown>;
      },
      options?: { body?: object },
    ) => {
      const userMessageId = message.messageId;

      if (userMessageId) {
        setMessages((currentMessages) => {
          if (
            currentMessages.some(
              (currentMessage) => currentMessage.id === userMessageId,
            )
          ) {
            return currentMessages;
          }

          return [
            ...currentMessages,
            {
              id: userMessageId,
              role: "user",
              parts: [{ type: "text", text: message.text }],
              metadata: message.metadata,
            },
          ];
        });
      }

      void sendMessage(message, options);
    },
    [sendMessage, setMessages],
  );

  return (
    <ChatInput
      threadId={undefined}
      chatProjectId={chatProjectId}
      setThreadId={handleThreadIdChange}
      sendMessage={sendMessageWithTracking}
      setOptimisticMessage={() => {
        /* empty */
      }}
      messages={messages}
      status={status}
      clientId={chatSessionId}
      convexMessages={EMPTY_CONVEX_MESSAGES}
      settings={settings}
      settingsReady={settingsReady}
      onModelChange={setModel}
      onSettingsChange={updateSettings}
    />
  );
}

export default function ProjectChatInputClient({
  chatProjectId,
}: {
  chatProjectId: string;
}) {
  return (
    <SignedCidProvider>
      <ProjectChatInput chatProjectId={chatProjectId} />
    </SignedCidProvider>
  );
}
