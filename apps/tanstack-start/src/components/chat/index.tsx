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
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { DefaultChatTransport } from "ai";
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  FileText,
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
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { useQuery } from "@/lib/hooks/convex";
import { resolveAttachments } from "@/server/attachments";
import { EmptyChat } from "./empty";
import { ChatInput } from "./input";
import { useChatSettings } from "./use-chat-settings";
import { useStableClientId } from "./use-stable-client-id";
import { getChatModelConfig } from "@redux/types";

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

interface ResolvedAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  expiresAt?: number;
  expired?: boolean;
  url?: string;
}

interface MessageAttachmentSummary {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  expiresAt?: number;
  expired?: boolean;
  url?: string;
}

function isAttachmentExpired(expiresAt: number | undefined, now = Date.now()) {
  return expiresAt !== undefined && expiresAt <= now;
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
      {model && <span className="flex items-center gap-1">{getChatModelConfig(model)?.name}</span>}

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

  const [optimisticMessage, setOptimisticMessage] = useState<
    UIMessage | undefined
  >(undefined);
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
  const locallyCompletedStreamRef = useRef(false);
  const {
    settings,
    isReady: settingsReady,
    setModel,
  } = useChatSettings(currentThreadId);
  const resolveAttachmentsFn = useServerFn(resolveAttachments);

  const [initialMessages] = useState(() => preload ?? []);

  const handleThreadIdChange = useCallback(
    (id: string) => {
      setCurrentThreadId(id);
      lastMessageCount.current = 0;
      void router.navigate({
        to: "/chat/$id",
        params: { id },
        replace: true,
      });
    },
    [router],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareReconnectToStreamRequest: () => ({
          api: `/api/chat/${currentThreadId}/stream`,
        }),
      }),
    [currentThreadId],
  );

  const { messages, status, sendMessage, setMessages, resumeStream } = useChat({
    id: chatInstanceId,
    messages: initialMessages,
    transport,

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

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setCurrentThreadId(initialThreadId);
      setOptimisticMessage(undefined);
      lastMessageCount.current = 0;

      if (status === "ready" && !initialThreadId) {
        setMessages([]);
      }
    });

    return () => {
      cancelled = true;
    };
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
  }, [activeStreamInfo, resumeStream, status, chatSessionId]);

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
  const [previewFile, setPreviewFile] = useState<{
    id: string;
    name: string;
    type: string;
    url?: string;
  } | null>(null);
  const [resolvedMessageAttachments, setResolvedMessageAttachments] = useState<
    Record<string, ResolvedAttachment>
  >({});

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

  const messageAttachmentsByMessageId = useMemo(() => {
    const map = new Map<string, MessageAttachmentSummary[]>();
    convexMessages?.forEach((message) => {
      if (!("attachments" in message) || !Array.isArray(message.attachments)) {
        return;
      }
      map.set(message.messageId, message.attachments);
    });
    return map;
  }, [convexMessages]);

  const attachmentIds = useMemo(
    () =>
      Array.from(
        new Set(
          convexMessages?.flatMap((message) =>
            "attachments" in message && Array.isArray(message.attachments)
              ? message.attachments.map((attachment) => attachment.attachmentId)
              : [],
          ) ?? [],
        ),
      ),
    [convexMessages],
  );

  useEffect(() => {
    if (attachmentIds.length === 0) {
      return;
    }

    let cancelled = false;

    void resolveAttachmentsFn({
      data: { attachmentIds },
    })
      .then((attachments) => {
        if (cancelled) {
          return;
        }

        setResolvedMessageAttachments(
          Object.fromEntries(
            attachments.map((attachment) => [
              attachment.attachmentId,
              {
                attachmentId: attachment.attachmentId,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                size: attachment.size,
                expiresAt: attachment.expiresAt,
                expired: attachment.expired,
                url: attachment.url,
              },
            ]),
          ),
        );
      })
      .catch((error) => {
        console.error("Failed to resolve message attachment URLs", error);
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentIds, resolveAttachmentsFn]);

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
                settings={settings}
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
                  const persistedAttachments: MessageAttachmentSummary[] =
                    messageAttachmentsByMessageId
                      .get(message.id)
                      ?.map((attachment) => ({
                        ...attachment,
                        expired:
                          resolvedMessageAttachments[attachment.attachmentId]
                            ?.expired ??
                          isAttachmentExpired(attachment.expiresAt),
                        expiresAt:
                          attachment.expiresAt ??
                          resolvedMessageAttachments[attachment.attachmentId]
                            ?.expiresAt,
                        url: resolvedMessageAttachments[attachment.attachmentId]
                          ?.url,
                      })) ?? [];
                  const messageMetadata = (
                    "metadata" in message ? message.metadata : undefined
                  ) as { attachments?: MessageAttachmentSummary[] } | undefined;
                  const optimisticAttachments =
                    persistedAttachments.length === 0 &&
                    messageMetadata &&
                    typeof messageMetadata === "object" &&
                    Array.isArray(messageMetadata.attachments)
                      ? messageMetadata.attachments
                      : [];
                  const attachmentsToRender =
                    persistedAttachments.length > 0
                      ? persistedAttachments
                      : optimisticAttachments;

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
                        {attachmentsToRender.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {attachmentsToRender.map((attachment) => {
                              const isImage =
                                attachment.mimeType.startsWith("image/");
                              const isExpired =
                                attachment.expired ??
                                isAttachmentExpired(attachment.expiresAt);
                              return (
                                <button
                                  key={attachment.attachmentId}
                                  type="button"
                                  onClick={() =>
                                    attachment.url &&
                                    !isExpired &&
                                    setPreviewFile({
                                      id: attachment.attachmentId,
                                      name: attachment.fileName,
                                      type: attachment.mimeType,
                                      url: attachment.url,
                                    })
                                  }
                                  className={cn(
                                    "border-border bg-background/70 flex items-center gap-2 rounded-xl border px-3 py-2 text-left",
                                    attachment.url &&
                                      !isExpired &&
                                      "hover:border-primary transition-colors",
                                    isExpired &&
                                      "text-muted-foreground opacity-70",
                                  )}
                                >
                                  {isImage && attachment.url && !isExpired ? (
                                    <img
                                      src={attachment.url}
                                      alt={attachment.fileName}
                                      className="h-10 w-10 rounded object-cover"
                                    />
                                  ) : (
                                    <FileText className="h-4 w-4 shrink-0" />
                                  )}
                                  <div className="min-w-0">
                                    <span className="block max-w-48 truncate text-sm">
                                      {attachment.fileName}
                                    </span>
                                    {isExpired && (
                                      <span className="text-muted-foreground block text-xs">
                                        Expired
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
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
        settings={settings}
        settingsReady={settingsReady}
        onModelChange={setModel}
      />

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
}
