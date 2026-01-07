"use client";

import type {
  TextUIPart,
  UIDataTypes,
  UIMessage,
  UITools,
} from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageSquareIcon } from "lucide-react";
import { Streamdown } from "streamdown";

import { api } from "@redux/backend/convex/_generated/api";
import { cn } from "@redux/ui/lib/utils";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { useQuery } from "@/lib/hooks/convex";
import { ChatInput } from "./input";

// Type guard to narrow part types to TextUIPart
const isTextPart = (part: { type: string }): part is TextUIPart =>
  part.type === "text";

export function Chat({
  initialThreadId,
  preload,
}: {
  initialThreadId: string | undefined;
  preload?: (typeof api.functions.threads.getThreadMessages)["_returnType"];
}) {  
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(
    initialThreadId
  );
  const [optimisticMessage, setOptimisticMessage] = useState<UIMessage | undefined>(undefined);
  const convexMessages = useQuery(
    api.functions.threads.getThreadMessages,
    { threadId: currentThreadId ?? "" },
    { default: preload, skip: !currentThreadId || !!optimisticMessage },
  );

  // Use a STABLE session ID for useChat - never changes during component lifetime
  // This prevents stale closure issues when sendMessage is called after setThreadId
  const [chatSessionId] = useState(() => crypto.randomUUID());
  
  // Initial messages from preload (stable, set once on mount)
  const [initialMessages] = useState(() => preload ?? []);
  
  const { messages, status, sendMessage, setMessages, resumeStream } = useChat({
    id: chatSessionId, // Stable ID - doesn't change when currentThreadId changes
    messages: initialMessages as UIMessage<unknown, UIDataTypes, UITools>[],
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareReconnectToStreamRequest: () => {
        console.log("prepareReconnectToStreamRequest", currentThreadId)
        return {
          api: `/api/chat/${currentThreadId}/stream`,
        };
      }
    }),
    onError: (error) => {
      console.error("Chat error:", error);
    },
    onData: (data) => {
      console.log("Data:", data);
    },
    onFinish: (message) => {
      console.log("Finish:", message);
    },
  });
  
  // Keep a ref to always have the latest sendMessage (avoids stale closures)
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);
  
  // Stable wrapper that always calls the latest sendMessage
  const stableSendMessage = useMemo(() => {
    return (...args: Parameters<typeof sendMessage>) => sendMessageRef.current(...args);
  }, []);

  const streamId = useQuery(api.functions.threads.getThreadStreamId, { threadId: currentThreadId ?? "" }, { skip: !currentThreadId || !!optimisticMessage });
  const lastStreamId = useRef<string | null>(null);
  const prevStatus = useRef(status);

  useEffect(() => {
    if (status === "streaming" && streamId) {
      lastStreamId.current = streamId;
    }
  }, [status, streamId]);

  useEffect(() => {
    if (status === "streaming" && optimisticMessage) {
      setOptimisticMessage(undefined);
    }
  }, [status, optimisticMessage])

  useEffect(() => {
    console.log("sid",streamId)
    if (streamId && status !== "streaming" && status !== "submitted" && !optimisticMessage) {
      if (lastStreamId.current === streamId) {
        return;
      }
      console.log("Resuming stream", streamId, status);
      lastStreamId.current = streamId;
      void resumeStream();
    }
  }, [streamId, resumeStream, status, optimisticMessage]);

  // useEffect(() => {
  //   if (convexMessages !== oldConvexMessages.current) {
  //     const newMessages = convexMessages?.filter(
  //       (m) => !oldConvexMessages.current?.some((cm) => cm.id === m.id),
  //     );
  //     if (newMessages && oldConvexMessages.current && status !== "streaming" && status !== "submitted") {
  //       let tries = 1;
  //       const delay = 250;
      
  //     }
  //     oldConvexMessages.current = convexMessages;
  //   }
  // }, [convexMessages, status, resumeStream]);

  // Convert convex messages to UI messages
  const convexUIMessages = useMemo(() => {
    return (
      convexMessages
        ?.filter((m) => m.status !== "generating") ?? []
    );
  }, [convexMessages]);

  // Sync convex messages to chat state when not streaming
  useEffect(() => {
    const isJustFinishedStreaming =
      prevStatus.current === "streaming" && status !== "streaming";

    // Don't sync from Convex while showing optimistic message
    if (status !== "streaming" && convexUIMessages.length > 0 && !optimisticMessage) {
      if (
        isJustFinishedStreaming &&
        messages.length > convexUIMessages.length
      ) {
        return;
      }
      console.log("Syncing messages", convexUIMessages, messages);
      setMessages(convexUIMessages);
    }
  // we are mutating messages, so it cant be a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convexUIMessages, status, setMessages, optimisticMessage]);

  useEffect(() => {
    prevStatus.current = status;
  }, [status]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation className="relative size-full">
        <ConversationContent className="pb-36">
          {!currentThreadId ? (
            <ConversationEmptyState
              description="Messages will appear here as the conversation progresses."
              icon={<MessageSquareIcon className="size-6" />}
              title="Start a conversation"
            />
          ) : (
            messages.map((message, i) => {
              const textParts = message.parts.filter(isTextPart);
              const textContent = textParts.map((part) => part.text).join("");
              const isStreamingAssistant = status === "streaming" && message.role === "assistant" && i === messages.length - 1;
              return (
                <div
                  key={message.id}
                  className={cn(
                    "flex w-full",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-4 py-2",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "",
                    )}
                  >
                    <Streamdown mode={isStreamingAssistant ? "streaming" : "static"}>{textContent}</Streamdown>
                  </div>
                </div>
              );
            })
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <ChatInput
        threadId={currentThreadId}
        setOptimisticMessage={setOptimisticMessage}
        setThreadId={(id) => {
          lastStreamId.current = null;
          prevStatus.current = "ready";
          window.history.replaceState({}, "", `/chat/${id}`);
          setCurrentThreadId(id);
          // void router.replace(`/chat/${id}`);
        }}
        sendMessage={stableSendMessage}
        messages={messages}
        status={status}
        currentLeafMessageId={convexMessages?.at(-1)?.messageId}
      />
    </div>
  );
}
