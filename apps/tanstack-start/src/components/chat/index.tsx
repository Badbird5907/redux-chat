"use client";

import type { TextPart, TextUIPart, UIMessage } from "ai";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRouter } from "@tanstack/react-router";
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  RefreshCwIcon,
  WholeWord,
  ZapIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { useStickToBottomContext } from "use-stick-to-bottom";

import { api } from "@redux/backend/convex/_generated/api";
import Spinner from "@redux/ui/components/spinner";
import { cn } from "@redux/ui/lib/utils";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { useQuery } from "@/lib/hooks/convex";
import { EmptyChat } from "./empty";
import { ChatInput } from "./input";
import { useStableClientId } from "./use-stable-client-id";

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

function MessageStatsBar({
  stats,
  isVisible,
  content,
  isStreaming,
}: {
  stats: MessageStats | undefined;
  isVisible: boolean;
  content?: string;
  isStreaming: boolean;
}) {
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
        "text-muted-foreground mt-2 flex min-h-[32px] items-center gap-4 text-xs transition-opacity duration-200",
        isVisible ? "opacity-100" : "opacity-0",
      )}
    >
      {/* Action buttons */}
      <div className="flex items-center gap-1">
        <button
          className={cn(
            "hover:bg-muted rounded p-2 transition-colors",
            isStreaming && "hidden",
          )}
          title="Copy"
          onClick={handleCopy}
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </button>
        {/* <button className="p-1 hover:bg-muted rounded transition-colors" title="Select">
          <MousePointerClickIcon className="size-4" />
        </button> */}
        <button
          className={cn(
            "hover:bg-muted rounded p-2 transition-colors",
            isStreaming && "hidden",
          )}
          title="Regenerate"
        >
          <RefreshCwIcon className="size-4" />
        </button>
      </div>

      {/* Model name */}
      {model && <span className="flex items-center gap-1">{model}</span>}

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

function InitialThreadScrollInitializer({
  enabled,
  onReady,
}: {
  enabled: boolean;
  onReady: () => void;
}) {
  const { scrollRef } = useStickToBottomContext();

  useLayoutEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const revealAfterPaint = () => {
      requestAnimationFrame(() => {
        if (!cancelled) {
          onReady();
        }
      });
    };

    const scrollElement = scrollRef.current;

    if (!scrollElement) {
      const animationFrame = requestAnimationFrame(() => {
        const nextScrollElement = scrollRef.current;

        if (nextScrollElement) {
          nextScrollElement.scrollTop = nextScrollElement.scrollHeight;
        }

        revealAfterPaint();
      });

      return () => {
        cancelled = true;
        cancelAnimationFrame(animationFrame);
      };
    }

    scrollElement.scrollTop = scrollElement.scrollHeight;
    revealAfterPaint();

    return () => {
      cancelled = true;
    };
  }, [enabled, onReady, scrollRef]);

  return null;
}

export function Chat({
  initialThreadId,
  preload,
}: {
  initialThreadId: string | undefined;
  preload?: (typeof api.functions.threads.getThreadMessages)["_returnType"];
}) {
  const router = useRouter();
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(
    initialThreadId,
  );

  // Track the last synced message count to avoid reverting to stale data during streaming
  const lastMessageCount = useRef(0);

  const [optimisticMessage, setOptimisticMessage] = useState<UIMessage | undefined>(undefined);
  const [initialThreadScrollReady, setInitialThreadScrollReady] = useState(
    () => !initialThreadId,
  );

  const convexMessages = useQuery(
    api.functions.threads.getThreadMessages,
    { threadId: currentThreadId ?? "" },
    {
      default: preload,
      skip: !currentThreadId,
    },
  );

  const chatSessionId = useStableClientId();
  const [chatInstanceId] = useState(() => initialThreadId ?? chatSessionId);
  const currentThreadIdRef = useRef(currentThreadId);
  const locallyCompletedStreamRef = useRef(false);

  const [initialMessages] = useState(() => preload ?? []);

  useEffect(() => {
    currentThreadIdRef.current = currentThreadId;
  }, [currentThreadId]);

  const handleThreadIdChange = useCallback((id: string) => {
    setCurrentThreadId(id);
    lastMessageCount.current = 0;
    void router.navigate({
      to: "/chat/$id",
      params: { id },
      replace: true,
    });
  }, [router]);

  const { messages, status, sendMessage, setMessages, resumeStream } = useChat({
    id: chatInstanceId,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      prepareReconnectToStreamRequest: () => {
        // console.log(
        //   "prepareReconnectToStreamRequest",
        //   currentThreadIdRef.current,
        // );
        return {
          api: `/api/chat/${currentThreadIdRef.current}/stream`,
        };
      },
      
    }),
    
    onError: (error) => {
      console.error("Chat error:", error);
    },
    onFinish: (message) => {
      console.log("Finish:", message);
      locallyCompletedStreamRef.current =
        !message.isAbort && !message.isDisconnect && !message.isError;
    },
  });

  useEffect(() => {
    if (status === "submitted" || status === "streaming") {
      locallyCompletedStreamRef.current = false;
    }
  }, [status]);

  useEffect(() => {
    if (initialThreadId === currentThreadId) {
      return;
    }

    setCurrentThreadId(initialThreadId);
    setOptimisticMessage(undefined);
    lastMessageCount.current = 0;

    if (status === "ready" && !initialThreadId) {
      setMessages([]);
    }
  }, [currentThreadId, initialThreadId, setMessages, status]);

  const activeStreamInfo = useQuery(
    api.functions.threads.getThreadStreamId,
    { threadId: currentThreadId ?? "" },
    { skip: !currentThreadId },
  ) as { streamId: string; clientId: string | undefined } | undefined;

  useEffect(() => {
    if (
      !activeStreamInfo?.streamId ||
      locallyCompletedStreamRef.current ||
      status === "streaming" ||
      status === "submitted"
    ) {
      return;
    }

    if (activeStreamInfo.clientId === chatSessionId) {
      console.log(
        "Resuming active stream after remount",
        activeStreamInfo.streamId,
      );
    } else {
      console.log(
        "Resuming stream from another client",
        activeStreamInfo.streamId,
      );
      console.log(chatSessionId, "vs", activeStreamInfo.clientId);
    }

    void resumeStream();
  }, [
    activeStreamInfo,
    resumeStream,
    status,
    chatSessionId,
  ]);

  const convexUIMessages = useMemo(() => {
    return convexMessages?.filter((m) => m.status !== "generating") ?? [];
  }, [convexMessages]);

  // Update message count tracking during streaming
  useEffect(() => {
    if (status === "streaming") {
      lastMessageCount.current = messages.length;
    }
  }, [status, messages.length]);

  useEffect(() => {
    if (
      status !== "streaming" &&
      !activeStreamInfo?.streamId &&
      convexUIMessages.length > 0
    ) {
      // Only sync if Convex has caught up (has at least as many messages as we had during streaming)
      if (convexUIMessages.length >= lastMessageCount.current) {
        console.log("Syncing messages (n,e)", convexUIMessages, messages);
        setMessages(convexUIMessages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messages intentionally excluded to prevent infinite loop
  }, [activeStreamInfo?.streamId, convexUIMessages, status, setMessages]);

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

  const finalMessages = useMemo(() => {
    if (optimisticMessage) {
      const first = messages[0];
      if (first?.role === "user" && first.id === optimisticMessage.id) {
        return messages;
      }
      return [...messages, optimisticMessage];
    }
    return messages;
  }, [messages, optimisticMessage]);

  const shouldInitializeInitialThreadScroll =
    Boolean(initialThreadId) &&
    finalMessages.length > 0 &&
    !initialThreadScrollReady &&
    status !== "submitted" &&
    status !== "streaming";

  const handleInitialThreadScrollReady = useCallback(() => {
    setInitialThreadScrollReady(true);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation className="relative size-full">
        <InitialThreadScrollInitializer
          enabled={shouldInitializeInitialThreadScroll}
          onReady={handleInitialThreadScrollReady}
        />
        <ConversationContent
          className={cn(
            "pt-0 pb-36 transition-opacity duration-200 ease-out",
            shouldInitializeInitialThreadScroll
              ? "pointer-events-none opacity-0"
              : "opacity-100",
          )}
        >
          <div className="mx-auto w-full max-w-3xl">
            {!currentThreadId && finalMessages.length === 0 ? (
              <EmptyChat
                threadId={currentThreadId}
                setThreadId={handleThreadIdChange}
                sendMessage={sendMessage}
                clientId={chatSessionId}
                convexMessages={convexUIMessages}
                setOptimisticMessage={(m) => setOptimisticMessage(m)}
              />
            ) : (
              <div className="flex flex-col gap-8">
                {finalMessages.map((message, i) => {
                  const textParts = message.parts.filter(isTextPart);
                  const textContent = textParts
                    .map((part: TextPart) => part.text)
                    .join("");
                  // Check if this is the last assistant message and we're streaming
                  const isLastMessage = i === messages.length - 1;
                  const isStreamingAssistant =
                    status === "streaming" &&
                    message.role === "assistant" &&
                    isLastMessage;
                  const messageStats = messageStatsMap.get(message.id);
                  const isHovered = hoveredMessageId === message.id;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex w-full",
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start",
                      )}
                      onMouseEnter={() =>
                        message.role === "assistant" &&
                        setHoveredMessageId(message.id)
                      }
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
                        <Streamdown
                          mode={isStreamingAssistant ? "streaming" : "static"}
                        >
                          {textContent}
                        </Streamdown>
                        {/* <span className="text-xs text-muted-foreground">
                          {message.id}
                        </span> */}
                        {/* Show stats bar for assistant messages on hover - always render to prevent layout shift */}
                        {message.role === "assistant" && (
                          <MessageStatsBar
                            stats={messageStats}
                            isVisible={isHovered}
                            content={textContent}
                            isStreaming={isStreamingAssistant && isLastMessage}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* Input area */}
      <ChatInput
        threadId={currentThreadId}
        setThreadId={handleThreadIdChange}
        sendMessage={sendMessage}
        setOptimisticMessage={(m) => setOptimisticMessage(m)}
        messages={messages}
        status={status}
        clientId={chatSessionId}
        convexMessages={convexUIMessages}
      />
    </div>
  );
}
