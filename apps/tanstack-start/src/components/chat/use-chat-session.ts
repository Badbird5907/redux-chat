import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { DefaultChatTransport } from "ai";
import { useMutation } from "convex/react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";

import type {
  ChatMessageWithThreadMetadata,
  MessageAttachmentSummary,
  MessageStats,
  ResolvedAttachment,
} from "./chat-types";
import { useSignedCid } from "@/components/chat/client-id";
import { useQuery } from "@/lib/hooks/convex";
import { resolveAttachments } from "@/server/attachments";
import {
  haveEquivalentMessageStructure,
  projectVisibleMessages,
  toChatUIMessage,
} from "./chat-message-utils";
import { useChatRouteAdoption } from "./chat-route-adoption";
import { useChatSettings } from "./use-chat-settings";
import { useStableClientId } from "./use-stable-client-id";

export interface UseChatSessionArgs {
  initialThreadId: string | undefined;
  chatProjectId?: string;
  preload?: (typeof api.functions.threads.getThreadMessages)["_returnType"];
}

export function useChatSession({
  initialThreadId,
  chatProjectId,
  preload,
}: UseChatSessionArgs) {
  const router = useRouter();
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(
    initialThreadId,
  );

  const lastMessageCount = useRef(0);
  const { allocate: allocateSignedIds } = useSignedCid();
  const createRegeneratedMessage = useMutation(
    api.functions.threads.regenerateMessage,
  );

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

  const {
    messages,
    status,
    sendMessage,
    setMessages,
    resumeStream,
    regenerate,
  } = useChat<ChatMessageWithThreadMetadata>({
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

  const projectedPersistedMessages = useMemo(() => {
    return projectVisibleMessages(
      convexMessages?.filter((message) => message.status !== "generating") ??
        [],
    );
  }, [convexMessages]);

  const convexUIMessages = useMemo<ChatMessageWithThreadMetadata[]>(() => {
    return projectedPersistedMessages.map(toChatUIMessage);
  }, [projectedPersistedMessages]);

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

    if (convexUIMessages.length < lastMessageCount.current) {
      return;
    }

    if (
      haveEquivalentMessageStructure(
        convexUIMessages,
        lastSyncedMessagesRef.current,
      )
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
  }, [
    activeStreamInfo?.streamId,
    convexUIMessages,
    messages,
    status,
    setMessages,
  ]);

  const regenerateMessageWithTracking = useCallback(
    async (messageId: string) => {
      if (!currentThreadId || status !== "ready") {
        return;
      }

      try {
        const [assistantMessageId] = await allocateSignedIds(1);
        if (!assistantMessageId) {
          throw new Error("Failed to get assistant message ID");
        }

        const regeneration = await createRegeneratedMessage({
          threadId: currentThreadId,
          fromAssistantMessageId: messageId,
          assistantMessageId: assistantMessageId.str,
          model: settings.model,
          settings,
        });

        locallyStartedStreamRef.current = true;
        locallyCompletedStreamRef.current = false;
        setPendingAssistantMessageId(regeneration.assistantMessageId);

        await regenerate({
          messageId,
          body: {
            threadId: regeneration.threadId,
            assistantMessageId: regeneration.assistantMessageId,
            fileIds: [],
            settings,
            model: settings.model,
            id: regeneration.threadId,
            clientId: chatSessionId,
          },
        });
      } catch (error) {
        locallyStartedStreamRef.current = false;
        locallyCompletedStreamRef.current = false;
        setPendingAssistantMessageId(undefined);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to regenerate message",
        );
        console.error("Failed to regenerate message:", error);
      }
    },
    [
      allocateSignedIds,
      chatSessionId,
      createRegeneratedMessage,
      currentThreadId,
      regenerate,
      settings,
      status,
    ],
  );

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
          message.role === "assistant" &&
          message.id === pendingAssistantMessageId,
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
    projectedPersistedMessages.forEach((message) => {
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
  }, [projectedPersistedMessages]);

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

  return {
    currentThreadId,
    handleThreadIdChange,
    effectiveChatProjectId,
    chatSessionId,
    messages,
    status,
    sendMessageWithTracking,
    regenerateMessageWithTracking,
    setOptimisticMessage,
    convexUIMessages,
    finalMessages,
    shouldInitializeInitialThreadScroll,
    handleInitialThreadScrollReady,
    messageStatsMap,
    hoveredMessageId,
    setHoveredMessageId,
    previewFile,
    setPreviewFile,
    resolvedMessageAttachments,
    messageAttachmentsByMessageId,
    assistantModelByParentMessageId,
    settings,
    baselineSettings,
    settingsReady,
    setModel,
    restoreSettings,
    updateSettings,
  };
}
