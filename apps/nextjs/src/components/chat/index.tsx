"use client";

import type {
  TextUIPart,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
} from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Loader2, MessageSquareIcon } from "lucide-react";
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
import { useRouter } from "next/navigation";

// Type guard to narrow part types to TextUIPart
const isTextPart = (part: { type: string }): part is TextUIPart =>
  part.type === "text";

type ConvexMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: unknown;
  status: "generating" | "completed" | "failed";
  createdAt: number;
};

const convexMessageToUIMessage = (m: ConvexMessage): UIMessage => {
  if (typeof m.content === "string") {
    return {
      ...m,
      parts: [{ type: "text" as const, text: m.content }],
      // @ts-expect-error - content is part of convex message
      content: undefined,
    };
  } else if (Array.isArray(m.content)) {
    return {
      ...m,
      parts: m.content as unknown as UIMessagePart<UIDataTypes, UITools>[],
      // @ts-expect-error - content is part of convex message
      content: undefined,
    };
  } else {
    return {
      ...m,
      parts: [{ type: "text" as const, text: "" }],
      // @ts-expect-error - content is part of convex message
      content: undefined,
    };
  }
};

export function Chat({
  initialThreadId,
  preload,
}: {
  initialThreadId: string | undefined;
  preload?: (typeof api.functions.threads.getThreadMessages)["_returnType"];
}) {  
  const router = useRouter();
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(
    initialThreadId
  );
  const [isOptimistic, setIsOptimistic] = useState(false);
  const convexMessages = useQuery(
    api.functions.threads.getThreadMessages,
    { threadId: currentThreadId ?? "" },
    { default: preload, skip: !currentThreadId || isOptimistic },
  );

  // Use a STABLE session ID for useChat - never changes during component lifetime
  // This prevents stale closure issues when sendMessage is called after setThreadId
  const [chatSessionId] = useState(() => initialThreadId ?? `pending-${crypto.randomUUID()}`);
  
  // Initial messages from preload (stable, set once on mount)
  const [initialMessages] = useState(() => preload?.map(convexMessageToUIMessage) ?? []);
  
  const { messages, status, sendMessage, setMessages, resumeStream } = useChat({
    id: chatSessionId, // Stable ID - doesn't change when currentThreadId changes
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
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

  useEffect(() => {
    console.log("messages", messages);
  }, [messages]);

  const streamId = useQuery(api.functions.threads.getThreadStreamId, { threadId: currentThreadId ?? "" }, { skip: !currentThreadId || isOptimistic });
  const lastStreamId = useRef<string | null>(null);
  const prevStatus = useRef(status);

  useEffect(() => {
    if (status === "streaming" && streamId) {
      lastStreamId.current = streamId;
    }
  }, [status, streamId]);

  useEffect(() => {
    if (streamId && status !== "streaming" && status !== "submitted" && !isOptimistic) {
      if (lastStreamId.current === streamId) {
        return;
      }
      console.log("Resuming stream", streamId, status);
      lastStreamId.current = streamId;
      void resumeStream();
    }
  }, [streamId, resumeStream, status, isOptimistic]);

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
  const convexUIMessages: UIMessage[] = useMemo(() => {
    return (
      convexMessages
        ?.filter((m) => m.status !== "generating")
        .map(convexMessageToUIMessage) ?? []
    );
  }, [convexMessages]);

  // Sync convex messages to chat state when not streaming
  useEffect(() => {
    const isJustFinishedStreaming =
      prevStatus.current === "streaming" && status !== "streaming";

    if (status !== "streaming" && convexUIMessages.length > 0) {
      if (
        isJustFinishedStreaming &&
        messages.length > convexUIMessages.length
      ) {
        return;
      }
      console.log("Syncing messages", convexUIMessages, messages);
      setMessages(convexUIMessages);
      // Reset optimistic mode once we have confirmed data from convex
      if (isOptimistic) {
        setIsOptimistic(false);
      }
    }
  // we are mutating messages, so it cant be a dep
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convexUIMessages, status, setMessages, isOptimistic]);

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
            messages.map((message) => {
              const textParts = message.parts.filter(isTextPart);
              const textContent = textParts.map((part) => part.text).join("");
              const isThinking = message.role === "assistant" && !textContent;
              
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
                        : "bg-muted",
                    )}
                  >
                    {isThinking ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Streamdown>{textContent}</Streamdown>
                    )}
                    <span className="text-xs text-gray-500">{message.id}</span>
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
        setThreadId={(id) => {
          console.log("setThreadId", id);
          // replace the other states too
          setIsOptimistic(true);
          lastStreamId.current = null;
          prevStatus.current = "ready";
          window.history.replaceState({}, "", `/chat/${id}`);
          setCurrentThreadId(id);
          // void router.replace(`/chat/${id}`);
        }}
        sendMessage={stableSendMessage}
        setMessages={setMessages}
        messages={messages}
        status={status}
      />
    </div>
  );
}
