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
import Spinner from "@redux/ui/components/spinner";

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

  // Update currentThreadId when initialThreadId changes (e.g., navigation to different thread)
  // Only sync if initialThreadId is defined AND different (don't reset to undefined when user creates new thread)
  useEffect(() => {
    if (initialThreadId && initialThreadId !== currentThreadId) {
      setCurrentThreadId(initialThreadId);
      // Reset stream tracking when switching threads
      lastResumedStreamId.current = null;
      prevStatus.current = "ready";
    }
  }, [initialThreadId, currentThreadId]);

  const convexMessages = useQuery(
    api.functions.threads.getThreadMessages,
    { threadId: currentThreadId ?? "" },
    { default: preload, skip: !currentThreadId || !!optimisticMessage },
  );

  const [chatSessionId] = useState(() => {
    const existingId = typeof window !== 'undefined' 
      ? sessionStorage.getItem('chatSessionId') 
      : null;
    
    if (existingId) {
      return existingId;
    }
    
    const newId = crypto.randomUUID();
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('chatSessionId', newId);
    }
    return newId;
  });
  
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
    onFinish: (message) => {
      console.log("Finish:", message);
    },
  });
  
  const sendMessageRef = useRef(sendMessage);
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);
  
  const stableSendMessage = useMemo(() => {
    return (...args: Parameters<typeof sendMessage>) => sendMessageRef.current(...args);
  }, []);

  const activeStreamInfo = useQuery(
    api.functions.threads.getThreadStreamId, 
    { threadId: currentThreadId ?? "" }, 
    { skip: !currentThreadId || !!optimisticMessage }
  ) as { streamId: string; clientId: string | undefined } | undefined;
  
  const lastResumedStreamId = useRef<string | null>(null);
  const prevStatus = useRef(status);

  useEffect(() => {
    if (status === "streaming" && activeStreamInfo?.streamId) {
      lastResumedStreamId.current = activeStreamInfo.streamId;
    }
  }, [status, activeStreamInfo?.streamId]);

  useEffect(() => {
    if (status === "streaming" && optimisticMessage) {
      setOptimisticMessage(undefined);
    }
  }, [status, optimisticMessage])

  useEffect(() => {
    if (!activeStreamInfo?.streamId || status === "streaming" || status === "submitted") {
      return;
    }
    
    if (optimisticMessage) {
      return;
    }
    
    if (activeStreamInfo.clientId === chatSessionId) {
      console.log("Skipping resume: stream is from this client");
      return;
    }
    
    if (lastResumedStreamId.current === activeStreamInfo.streamId) {
      return;
    }
    
    console.log("Resuming stream from another client", activeStreamInfo.streamId);
    console.log(chatSessionId, "vs", activeStreamInfo.clientId)
    lastResumedStreamId.current = activeStreamInfo.streamId;
    void resumeStream();
  }, [activeStreamInfo, resumeStream, status, optimisticMessage, chatSessionId]);

  const convexUIMessages = useMemo(() => {
    return (
      convexMessages
        ?.filter((m) => m.status !== "generating") ?? []
    );
  }, [convexMessages]);

  useEffect(() => {
    const isJustFinishedStreaming =
      prevStatus.current === "streaming" && status !== "streaming";

    if (status !== "streaming" && convexUIMessages.length > 0 && !optimisticMessage) {
      // Don't sync immediately after streaming finishes - wait for Convex to update
      if (isJustFinishedStreaming) {
        return;
      }
      console.log("Syncing messages", convexUIMessages, messages);
      setMessages(convexUIMessages);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convexUIMessages, status, setMessages, optimisticMessage]);

  useEffect(() => {
    prevStatus.current = status;
  }, [status]);

  const finalMessages = useMemo(() => {
    if (optimisticMessage && messages.length > 0) {
      if (messages.at(-1)?.role === "user") { // our message has shown up
        return messages;
      }
    }
    return [...messages, optimisticMessage].filter(Boolean);
  }, [messages, optimisticMessage])
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation className="relative size-full">
        <ConversationContent className="pb-36">
          {!currentThreadId && finalMessages.length === 0 ? (
            <ConversationEmptyState
              description="Messages will appear here as the conversation progresses."
              icon={<MessageSquareIcon className="size-6" />}
              title="Start a conversation"
            />
          ) : (
            finalMessages.map((message, i) => {
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
                    {!message.parts.length && (
                      <Spinner className="size-4" />
                    )}
                    <Streamdown mode={isStreamingAssistant ? "streaming" : "static"}>{textContent}</Streamdown>
                    {/* <span className="text-xs text-gray-500">{message.id}</span> */}
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
          lastResumedStreamId.current = null;
          prevStatus.current = "ready";
          window.history.replaceState({}, "", `/chat/${id}`);
          setCurrentThreadId(id);
        }}
        sendMessage={stableSendMessage}
        messages={messages}
        status={status}
        currentLeafMessageId={convexMessages?.at(-1)?.messageId}
        clientId={chatSessionId}
      />
    </div>
  );
}
