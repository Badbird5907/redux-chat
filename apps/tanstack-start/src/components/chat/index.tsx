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
import { CheckIcon, ClockIcon, CopyIcon, RefreshCwIcon, WholeWord, ZapIcon } from "lucide-react";
import { Streamdown } from "streamdown";

import { api } from "@redux/backend/convex/_generated/api";
import { cn } from "@redux/ui/lib/utils";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { useQuery } from "@/lib/hooks/convex";
import { ChatInput } from "./input";
import Spinner from "@redux/ui/components/spinner";
import { EmptyChat } from "./empty";

// Type guard to narrow part types to TextUIPart
const isTextPart = (part: { type: string }): part is TextUIPart =>
  part.type === "text";

// Type for message stats from Convex
interface MessageStats {
  usage?: {
    promptTokens: number;
    responseTokens: number;
    totalTokens: number;
  };
  generationStats?: {
    timeToFirstTokenMs: number;
    totalDurationMs: number;
    tokensPerSecond: number;
  };
  model?: string;
  content?: string;
}

function MessageStatsBar({ stats, isVisible, content }: { stats: MessageStats | undefined; isVisible: boolean; content?: string }) {
  const [copied, setCopied] = useState(false);
  
  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };
  
  const usage = stats?.usage;
  const generationStats = stats?.generationStats;
  const model = stats?.model;
  
  // Always render the container to prevent layout shift, just hide content when no stats
  return (
    <div 
      className={cn(
        "flex items-center gap-4 text-xs text-muted-foreground mt-2 transition-opacity duration-200 min-h-[32px]",
        isVisible ? "opacity-100" : "opacity-0"
      )}
    >
      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button 
          className="p-2 hover:bg-muted rounded transition-colors" 
          title="Copy"
          onClick={handleCopy}
        >
          {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
        </button>
        {/* <button className="p-1 hover:bg-muted rounded transition-colors" title="Select">
          <MousePointerClickIcon className="size-4" />
        </button> */}
        <button className="p-2 hover:bg-muted rounded transition-colors" title="Regenerate">
          <RefreshCwIcon className="size-4" />
        </button>
      </div>
      
      {/* Model name */}
      {model && (
        <span className="flex items-center gap-1">
          {model}
        </span>
      )}
      
      {/* Tokens per second */}
      {generationStats && (
        <span className="flex items-center gap-1">
          <ZapIcon className="size-3.5" />
          {generationStats.tokensPerSecond.toFixed(2)} tok/sec
        </span>
      )}
      
      {/* Time to first token */}
      {generationStats && (
        <span className="flex items-center gap-1">
          <ClockIcon className="size-3.5" />
          TTFT: {(generationStats.timeToFirstTokenMs / 1000).toFixed(2)} sec
        </span>
      )}

      {/* Total tokens */}
      {usage && (
        <span className="flex items-center gap-1">
          <WholeWord className="size-3.5" />
          {usage.responseTokens} tokens
        </span>
      )}
      
    </div>
  );
}

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

  // Track the last synced message count to avoid reverting to stale data during streaming
  const lastMessageCount = useRef(0);

  // Update currentThreadId when initialThreadId changes (e.g., navigation to different thread)
  // Only sync if initialThreadId is defined AND different (don't reset to undefined when user creates new thread)
  useEffect(() => {
    if (initialThreadId && initialThreadId !== currentThreadId) {
      setCurrentThreadId(initialThreadId);
      // Reset message count tracking when switching threads
      lastMessageCount.current = 0;
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
      },
    }),
    onError: (error) => {
      console.error("Chat error:", error);
    },
    onFinish: (message) => {
      console.log("Finish:", message);
    },
  });

  const activeStreamInfo = useQuery(
    api.functions.threads.getThreadStreamId, 
    { threadId: currentThreadId ?? "" }, 
    { skip: !currentThreadId || !!optimisticMessage }
  ) as { streamId: string; clientId: string | undefined } | undefined;

  useEffect(() => {
    // Only clear optimistic message once the useChat hook has received the user message
    // This prevents a flash of empty content during the transition from submitted to streaming
    if ((status === "streaming" || status === "submitted") && optimisticMessage && messages.length > 0) {
      // Check if the user message has been added to messages
      const hasUserMessage = messages.some(m => m.id === optimisticMessage.id);
      if (hasUserMessage) {
        setOptimisticMessage(undefined);
      }
    }
  }, [status, optimisticMessage, messages])

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
    
    console.log("Resuming stream from another client", activeStreamInfo.streamId);
    console.log(chatSessionId, "vs", activeStreamInfo.clientId)
    void resumeStream();
  }, [activeStreamInfo, resumeStream, status, optimisticMessage, chatSessionId]);

  const convexUIMessages = useMemo(() => {
    return (
      convexMessages
        ?.filter((m) => m.status !== "generating") ?? []
    );
  }, [convexMessages]);

  // Update message count tracking during streaming
  useEffect(() => {
    if (status === "streaming") {
      lastMessageCount.current = messages.length;
    }
  }, [status, messages.length]);

  useEffect(() => {
    if (status !== "streaming" && convexUIMessages.length > 0 && !optimisticMessage) {
      // Only sync if Convex has caught up (has at least as many messages as we had during streaming)
      if (convexUIMessages.length >= lastMessageCount.current) {
        console.log("Syncing messages (n,e)", convexUIMessages, messages);
        setMessages(convexUIMessages);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- messages intentionally excluded to prevent infinite loop
  }, [convexUIMessages, status, setMessages, optimisticMessage])

  // Create a map of message stats from convexMessages
  const messageStatsMap = useMemo(() => {
    const map = new Map<string, MessageStats>();
    convexMessages?.forEach((m) => {
      if (m.role === "assistant") {
        map.set(m.messageId, {
          usage: m.usage,
          generationStats: m.generationStats,
          model: m.model,
        });
      }
    });
    return map;
  }, [convexMessages]);

  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation className="relative size-full">
        <ConversationContent className="pt-0 pb-36">
          <div className="mx-auto w-full max-w-3xl">
            {!currentThreadId && messages.length === 0 ? (
              <EmptyChat />
            ) : (
              <div className="flex flex-col gap-8">
                {messages.map((message, i) => {
                  const textParts = message.parts.filter(isTextPart);
                  const textContent = textParts.map((part) => part.text).join("");
                  // Check if this is the last assistant message and we're streaming
                  const isLastMessage = i === messages.length - 1;
                  const isStreamingAssistant = status === "streaming" && message.role === "assistant" && isLastMessage;
                  const messageStats = messageStatsMap.get(message.id);
                  const isHovered = hoveredMessageId === message.id;
                  
                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex w-full",
                        message.role === "user" ? "justify-end" : "justify-start",
                      )}
                      onMouseEnter={() => message.role === "assistant" && setHoveredMessageId(message.id)}
                      onMouseLeave={() => setHoveredMessageId(null)}
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
                        {/* Show stats bar for assistant messages on hover - always render to prevent layout shift */}
                        {message.role === "assistant" && (
                          <MessageStatsBar stats={messageStats} isVisible={isHovered} content={textContent} />
                        )}
                      </div>
                    </div>
                  );
                })}
                {messages.slice(-1).filter((m): m is UIMessage => m.role === "user").map((message) => (
                  <div key={message.id} className="px-4 py-2">
                    <Spinner className="size-4" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <ChatInput
        threadId={currentThreadId}
        setOptimisticMessage={setOptimisticMessage}
        setThreadId={(id) => {
          setCurrentThreadId(id);
          lastMessageCount.current = 0;
          window.history.replaceState({}, "", `/chat/${id}`);
        }}
        sendMessage={sendMessage}
        messages={messages}
        status={status}
        currentLeafMessageId={convexMessages?.at(-1)?.messageId}
        clientId={chatSessionId}
      />
    </div>
  );
}
