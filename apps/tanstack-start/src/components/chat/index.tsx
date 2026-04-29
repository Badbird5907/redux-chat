"use client";

import type { UIMessage } from "ai";
import type { ReactNode } from "react";
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
import { DefaultChatTransport, isTextUIPart } from "ai";
import {
  ArrowRightLeft,
  CheckIcon,
  CircleAlert,
  ClockIcon,
  CopyIcon,
  FileText,
  Loader2,
  RefreshCwIcon,
  WholeWord,
  ZapIcon,
} from "lucide-react";
import { useStickToBottomContext } from "use-stick-to-bottom";

import { api } from "@redux/backend/convex/_generated/api";
import {
  classifyChatAttachment,
  resolveModelAttachmentDelivery,
  resolveModelRoute,
} from "@redux/shared/models";
import { getChatModelConfig } from "@redux/types";
import { Card, CardContent } from "@redux/ui/components/card";
import Spinner from "@redux/ui/components/spinner";
import { cn } from "@redux/ui/lib/utils";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { AssistantMessageParts } from "@/components/chat/assistant-message-parts";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { StaticMarkdown } from "@/components/markdown/static-markdown";
import { useQuery } from "@/lib/hooks/convex";
import { resolveAttachments } from "@/server/attachments";
import { useChatRouteAdoption } from "./chat-route-adoption";
import { EmptyChat } from "./empty";
import { ChatInput } from "./input";
import { useChatSettings } from "./use-chat-settings";
import { useStableClientId } from "./use-stable-client-id";

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
  convertingToPdf?: boolean;
  generatingDerivative?: boolean;
  originalFileName?: string;
  usedDerivative?: boolean;
  mimeType: string;
  size: number;
  expiresAt?: number;
  expired?: boolean;
  url?: string;
}

interface MessageAttachmentSummary {
  attachmentId: string;
  convertingToPdf?: boolean;
  generatingDerivative?: boolean;
  fileName: string;
  originalFileName?: string;
  usedDerivative?: boolean;
  mimeType: string;
  size: number;
  expiresAt?: number;
  expired?: boolean;
  url?: string;
}

type PersistedChatMessage =
  (typeof api.functions.threads.getThreadMessages)["_returnType"][number];

type ChatMessageWithThreadMetadata = UIMessage & {
  error?: string;
  model?: string;
  parentId?: string;
  status?: "generating" | "completed" | "failed";
};

function toChatUIMessage(
  message: PersistedChatMessage,
): ChatMessageWithThreadMetadata {
  const metadata =
    "attachments" in message && Array.isArray(message.attachments)
      ? {
          attachments: message.attachments,
        }
      : undefined;

  return {
    id: message.id,
    role: message.role,
    parts: message.parts as UIMessage["parts"],
    metadata,
    error: "error" in message ? message.error : undefined,
    model: "model" in message ? message.model : undefined,
    parentId: "parentId" in message ? message.parentId : undefined,
    status: "status" in message ? message.status : undefined,
  };
}

function haveEquivalentMessageStructure(
  left: UIMessage[],
  right: UIMessage[],
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((message, index) => {
    const other = right[index];

    if (!other) {
      return false;
    }

    if (message.id !== other.id || message.role !== other.role) {
      return false;
    }

    if (message.parts.length !== other.parts.length) {
      return false;
    }

    return message.parts.every((part, partIndex) => {
      const otherPart = other.parts[partIndex];

      if (part.type !== otherPart?.type) {
        return false;
      }

      if ("text" in part || "text" in otherPart) {
        return "text" in part && "text" in otherPart && part.text === otherPart.text;
      }

      return true;
    });
  });
}

function isAttachmentExpired(expiresAt: number | undefined, now = Date.now()) {
  return expiresAt !== undefined && expiresAt <= now;
}

function attachmentDisplayName(a: {
  fileName: string;
  originalFileName?: string;
}) {
  return a.originalFileName ?? a.fileName;
}

function didUseDerivative(attachment: {
  originalFileName?: string;
  usedDerivative?: boolean;
}) {
  return attachment.usedDerivative ?? attachment.originalFileName !== undefined;
}

function isGeneratingDerivative(attachment: {
  convertingToPdf?: boolean;
  generatingDerivative?: boolean;
  originalFileName?: string;
  usedDerivative?: boolean;
}) {
  return (
    (attachment.generatingDerivative ?? attachment.convertingToPdf) === true &&
    !didUseDerivative(attachment)
  );
}

function modelUsesDerivativeForAttachment(
  modelId: string | undefined,
  attachment: Pick<MessageAttachmentSummary, "fileName" | "mimeType">,
) {
  if (!modelId) {
    return false;
  }

  const route = resolveModelRoute(modelId);
  if (!route) {
    return false;
  }

  const deliveryMode = resolveModelAttachmentDelivery(route.id, {
    name: attachment.fileName,
    type: attachment.mimeType,
  });
  if (!deliveryMode) {
    return false;
  }

  if (deliveryMode !== "native") {
    return true;
  }

  return (
    classifyChatAttachment(attachment) === "pdf" &&
    !route.modalities.input.includes("pdf")
  );
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
      {model && (
        <span className="flex items-center gap-1">
          {getChatModelConfig(model)?.name}
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
  chatProjectId,
  preload,
  emptyContent,
}: {
  initialThreadId: string | undefined;
  chatProjectId?: string;
  preload?: (typeof api.functions.threads.getThreadMessages)["_returnType"];
  /** Custom content to show when there's no active thread. Defaults to the
   *  greeting + suggestion cards in <EmptyChat />. */
  emptyContent?: ReactNode;
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
  const [pendingAssistantMessageId, setPendingAssistantMessageId] = useState<
    string | undefined
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

  // When the caller didn't pass a chatProjectId (e.g. on /chat/$id), look it
  // up from the thread itself so project chats still show project context.
  const threadForProject = useQuery(
    api.functions.threads.getThread,
    { threadId: currentThreadId ?? "" },
    { skip: !currentThreadId || Boolean(chatProjectId) },
  );
  const effectiveChatProjectId =
    chatProjectId ?? threadForProject?.chatProjectId ?? undefined;

  const chatSessionId = useStableClientId();
  const [chatInstanceId] = useState(() => initialThreadId ?? chatSessionId);
  const locallyCompletedStreamRef = useRef(false);
  const locallyStartedStreamRef = useRef(false);
  const lastSyncedMessagesRef = useRef<UIMessage[]>([]);
  const { markAdoptedThreadNavigation } = useChatRouteAdoption();
  const {
    settings,
    baselineSettings,
    isReady: settingsReady,
    setModel,
    restoreSettings,
    updateSettings,
  } = useChatSettings(currentThreadId);
  const resolveAttachmentsFn = useServerFn(resolveAttachments);

  const [initialMessages] = useState<ChatMessageWithThreadMetadata[]>(() =>
    (preload ?? []).map(toChatUIMessage),
  );

  const handleThreadIdChange = useCallback(
    (id: string) => {
      setCurrentThreadId(id);
      lastMessageCount.current = 0;
      markAdoptedThreadNavigation(id);
      void router.navigate({
        to: "/chat/$id",
        params: { id },
        replace: true,
      });
    },
    [markAdoptedThreadNavigation, router],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareReconnectToStreamRequest: () => {
          console.log("prepareReconnectToStreamRequest", currentThreadId);
          return {
            api: `/api/chat/${currentThreadId}/stream`,
          };
        },
      }),
    [currentThreadId],
  );

  const { messages, status, sendMessage, setMessages, resumeStream } = useChat<ChatMessageWithThreadMetadata>({
    id: chatInstanceId,
    messages: initialMessages,
    transport,

    onError: (error) => {
      locallyStartedStreamRef.current = false;
      console.error("Chat error:", error);
    },
    onFinish: (message) => {
      console.log("Finish:", message);
      locallyStartedStreamRef.current = false;
      locallyCompletedStreamRef.current =
        !message.isAbort && !message.isDisconnect && !message.isError;
    },
  });

  const sendMessageWithTracking = useCallback(
    (
      message: {
        text: string;
        messageId?: string;
        metadata?: Record<string, unknown>;
      },
      options?: { body?: object },
    ) => {
      locallyStartedStreamRef.current = true;
      locallyCompletedStreamRef.current = false;

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

      const assistantMessageId =
        options?.body &&
        typeof options.body === "object" &&
        "assistantMessageId" in options.body &&
        typeof options.body.assistantMessageId === "string"
          ? options.body.assistantMessageId
          : undefined;

      if (assistantMessageId) {
        setPendingAssistantMessageId(assistantMessageId);
      }

      void sendMessage(message, options);
    },
    [sendMessage, setMessages],
  );

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

      locallyStartedStreamRef.current = false;
      locallyCompletedStreamRef.current = false;
      setCurrentThreadId(initialThreadId);
      setOptimisticMessage(undefined);
      setPendingAssistantMessageId(undefined);
      lastMessageCount.current = 0;
      lastSyncedMessagesRef.current = [];

      if (status === "ready" && !initialThreadId) {
        setMessages([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentThreadId, initialThreadId, setMessages, status]);

  useEffect(() => {
    if (initialThreadId || currentThreadId || status !== "ready") {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      locallyStartedStreamRef.current = false;
      locallyCompletedStreamRef.current = false;
      setOptimisticMessage(undefined);
      setPendingAssistantMessageId(undefined);
      lastMessageCount.current = 0;
      lastSyncedMessagesRef.current = [];
      setMessages([]);
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

    if (
      activeStreamInfo.clientId === chatSessionId &&
      locallyStartedStreamRef.current
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

  const convexUIMessages = useMemo<ChatMessageWithThreadMetadata[]>(() => {
    return (
      convexMessages
        ?.filter((message) => message.status !== "generating")
        .map(toChatUIMessage) ?? []
    );
  }, [convexMessages]);

  // Update message count tracking during streaming
  useEffect(() => {
    if (status === "streaming") {
      lastMessageCount.current = messages.length;
    }
  }, [status, messages.length]);

  useEffect(() => {
    if (!optimisticMessage) {
      return;
    }

    if (!messages.some((message) => message.id === optimisticMessage.id)) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setOptimisticMessage(undefined);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [messages, optimisticMessage]);

  useEffect(() => {
    if (!pendingAssistantMessageId) {
      return;
    }

    const shouldClear =
      messages.some(
        (message) =>
          message.role === "assistant" &&
          message.id === pendingAssistantMessageId,
      ) || status === "error";

    if (!shouldClear) {
      return;
    }

    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setPendingAssistantMessageId(undefined);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [messages, pendingAssistantMessageId, status]);

  useEffect(() => {
    if (
      status !== "ready" ||
      activeStreamInfo?.streamId ||
      convexUIMessages.length === 0 ||
      locallyStartedStreamRef.current ||
      locallyCompletedStreamRef.current
    ) {
      return;
    }

    // Only sync if Convex has caught up and would actually change the local message list.
    if (convexUIMessages.length < lastMessageCount.current) {
      return;
    }

    if (
      haveEquivalentMessageStructure(convexUIMessages, lastSyncedMessagesRef.current)
    ) {
      return;
    }

    if (haveEquivalentMessageStructure(convexUIMessages, messages)) {
      lastSyncedMessagesRef.current = convexUIMessages;
      return;
    }

    console.log("Syncing messages (n,e)", convexUIMessages, messages);
    lastSyncedMessagesRef.current = convexUIMessages;
    setMessages(convexUIMessages);
  }, [activeStreamInfo?.streamId, convexUIMessages, messages, status, setMessages]);

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
    generatingDerivative?: boolean;
    id: string;
    name: string;
    type: string;
    url?: string;
    usedDerivative?: boolean;
  } | null>(null);
  const [resolvedMessageAttachments, setResolvedMessageAttachments] = useState<
    Record<string, ResolvedAttachment>
  >({});

  const finalMessages = useMemo(() => {
    const nextMessages: ChatMessageWithThreadMetadata[] = [...messages];

    if (
      optimisticMessage &&
      !nextMessages.some((message) => message.id === optimisticMessage.id)
    ) {
      nextMessages.push(optimisticMessage);
    }

    if (
      pendingAssistantMessageId &&
      !nextMessages.some(
        (message) =>
          message.role === "assistant" && message.id === pendingAssistantMessageId,
      )
    ) {
      nextMessages.push({
        id: pendingAssistantMessageId,
        role: "assistant",
        parts: [],
      });
    }

    return nextMessages;
  }, [messages, optimisticMessage, pendingAssistantMessageId]);

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

  const assistantModelByParentMessageId = useMemo(() => {
    const map = new Map<string, string>();
    convexMessages?.forEach((message) => {
      const messageWithMetadata = message as ChatMessageWithThreadMetadata;
      if (
        messageWithMetadata.role !== "assistant" ||
        typeof messageWithMetadata.parentId !== "string" ||
        typeof messageWithMetadata.model !== "string"
      ) {
        return;
      }

      map.set(messageWithMetadata.parentId, messageWithMetadata.model);
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
                originalFileName: attachment.originalFileName,
                usedDerivative:
                  attachment.originalFileName !== undefined ? true : undefined,
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
  }, [attachmentIds, resolveAttachmentsFn, status]);

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
              (emptyContent ?? (
                <EmptyChat
                  threadId={currentThreadId}
                  chatProjectId={effectiveChatProjectId}
                  setThreadId={handleThreadIdChange}
                  sendMessage={sendMessageWithTracking}
                  clientId={chatSessionId}
                  convexMessages={convexUIMessages}
                  setOptimisticMessage={(m) => setOptimisticMessage(m)}
                  settings={settings}
                />
              ))
            ) : (
              <div className="flex flex-col gap-8">
                {finalMessages.map(
                  (message: ChatMessageWithThreadMetadata, i) => {
                    const textContent = message.parts.reduce<string>(
                      (content, part: UIMessage["parts"][number]) => {
                        if (!isTextUIPart(part)) {
                          return content;
                        }

                        return content + part.text;
                      },
                      "",
                    );
                    // Check if this is the last assistant message and we're streaming
                    const isLastMessage = i === finalMessages.length - 1;
                    const isStreamingAssistant =
                      (status === "streaming" || status === "submitted") &&
                      message.role === "assistant" &&
                      isLastMessage;
                    const messageStats = messageStatsMap.get(message.id);
                    const isHovered = hoveredMessageId === message.id;
                    const isFailedMessage = message.status === "failed";
                    const responseModel = assistantModelByParentMessageId.get(
                      message.id,
                    );
                    const persistedAttachments: MessageAttachmentSummary[] =
                      messageAttachmentsByMessageId
                        .get(message.id)
                        ?.map((attachment) => ({
                          ...attachment,
                          fileName:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.fileName ?? attachment.fileName,
                          generatingDerivative:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.generatingDerivative ??
                            attachment.generatingDerivative,
                          originalFileName:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.originalFileName ?? attachment.originalFileName,
                          usedDerivative:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.usedDerivative ??
                            attachment.usedDerivative ??
                            modelUsesDerivativeForAttachment(
                              responseModel,
                              attachment,
                            ),
                          mimeType:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.mimeType ?? attachment.mimeType,
                          size:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.size ?? attachment.size,
                          expired:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.expired ??
                            isAttachmentExpired(attachment.expiresAt),
                          expiresAt:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.expiresAt ?? attachment.expiresAt,
                          url:
                            resolvedMessageAttachments[attachment.attachmentId]
                              ?.url ?? attachment.url,
                        })) ?? [];
                    const messageMetadata = (
                      "metadata" in message ? message.metadata : undefined
                    ) as
                      | { attachments?: MessageAttachmentSummary[] }
                      | undefined;
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
                            "rounded-lg px-4 py-2",
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "w-full",
                          )}
                        >
                          {!message.parts.length && !isFailedMessage && (
                            <Spinner className="size-4" />
                          )}
                          {isFailedMessage ? (
                            <Card
                              size="sm"
                              className="border-destructive/40 bg-destructive/10 text-destructive ring-destructive/20 w-full gap-2 py-3 shadow-none"
                            >
                              <CardContent className="flex items-start gap-3 px-3">
                                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                <div className="min-w-0 space-y-1">
                                  <p className="font-medium">
                                    Message generation failed
                                  </p>
                                  {message.error && (
                                    <p className="text-destructive/80 wrap-break-word">
                                      {message.error}
                                    </p>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          ) : message.role === "assistant" ? (
                            <AssistantMessageParts
                              isLastMessage={isLastMessage}
                              isStreaming={isStreamingAssistant}
                              message={message}
                            />
                          ) : (
                            <StaticMarkdown content={textContent} />
                          )}
                          {attachmentsToRender.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {attachmentsToRender.map((attachment) => {
                                const isImage =
                                  attachment.mimeType.startsWith("image/");
                                const isExpired =
                                  attachment.expired ??
                                  isAttachmentExpired(attachment.expiresAt);
                                const usedDerivative =
                                  didUseDerivative(attachment);
                                const generatingDerivative =
                                  isGeneratingDerivative(attachment);
                                return (
                                  <button
                                    key={attachment.attachmentId}
                                    type="button"
                                    onClick={() =>
                                      (generatingDerivative ||
                                        (attachment.url && !isExpired)) &&
                                      setPreviewFile({
                                        id: attachment.attachmentId,
                                        name: attachmentDisplayName(attachment),
                                        type: attachment.mimeType,
                                        url: attachment.url,
                                        generatingDerivative,
                                        usedDerivative,
                                      })
                                    }
                                    className={cn(
                                      "border-border bg-background/70 relative flex items-center gap-2 rounded-xl border px-3 py-2 text-left",
                                      (generatingDerivative ||
                                        (attachment.url && !isExpired)) &&
                                        "hover:border-primary transition-colors",
                                      isExpired &&
                                        "text-muted-foreground opacity-70",
                                    )}
                                  >
                                    {(usedDerivative ||
                                      generatingDerivative) && (
                                      <span
                                        aria-hidden
                                        className="text-muted-foreground bg-background/90 pointer-events-none absolute bottom-2 left-2 rounded p-px shadow-sm"
                                        style={{
                                          transform:
                                            "translateX(-6px) translateY(5px)",
                                        }}
                                        title={
                                          generatingDerivative
                                            ? "Preparing derivative"
                                            : "Used derivative"
                                        }
                                      >
                                        {usedDerivative && (
                                          <ArrowRightLeft className="h-3 w-3" />
                                        )}
                                        {generatingDerivative && (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        )}
                                      </span>
                                    )}
                                    {isImage && attachment.url && !isExpired ? (
                                      <img
                                        src={attachment.url}
                                        alt={attachmentDisplayName(attachment)}
                                        className="h-10 w-10 rounded object-cover"
                                      />
                                    ) : (
                                      <FileText className="h-4 w-4 shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                      <span className="block max-w-48 truncate text-sm">
                                        {attachmentDisplayName(attachment)}
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
                              isStreaming={
                                isStreamingAssistant && isLastMessage
                              }
                            />
                          )}
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            )}
          </div>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <ChatInput
        threadId={currentThreadId}
        chatProjectId={effectiveChatProjectId}
        setThreadId={handleThreadIdChange}
        sendMessage={sendMessageWithTracking}
        setOptimisticMessage={(m) => setOptimisticMessage(m)}
        messages={messages}
        status={status}
        clientId={chatSessionId}
        convexMessages={convexUIMessages}
        settings={settings}
        baselineSettings={baselineSettings}
        settingsReady={settingsReady}
        onModelChange={setModel}
        onSettingsChange={updateSettings}
        restoreSettings={restoreSettings}
      />

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
}
