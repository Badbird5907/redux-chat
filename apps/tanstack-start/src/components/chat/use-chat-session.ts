import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { DefaultChatTransport } from "ai";
import { useMutation } from "convex/react";

import { api } from "@redux/backend/convex/_generated/api";

import type {
  ChatMessageWithThreadMetadata,
  MessageAttachmentSummary,
  MessageStats,
  ResolvedAttachment,
} from "./chat-types";
import type { ChatPreload } from "./preload";
import { useQuery } from "@/lib/hooks/convex";
import { resolveAttachments } from "@/server/attachments";
import {
  getDeepestLeafForBranch,
  getVisibleBranchMessages,
} from "./chat-branching";
import {
  haveEquivalentMessageStructure,
  toChatUIMessage,
} from "./chat-message-utils";
import { useChatRouteAdoption } from "./chat-route-adoption";
import { useSignedCid } from "./client-id";
import { useChatSettings } from "./use-chat-settings";
import { useStableClientId } from "./use-stable-client-id";

export interface UseChatSessionArgs {
  initialThreadId: string | undefined;
  chatProjectId?: string;
  preload?: ChatPreload;
}

export function useChatSession({
  initialThreadId,
  chatProjectId,
  preload,
}: UseChatSessionArgs) {
  const initialSettings = useMemo(() => {
    const settingsJson = preload?.thread?.settingsJson ?? preload?.settingsJson;
    if (!settingsJson) {
      return undefined;
    }

    try {
      return JSON.parse(settingsJson) as Record<string, unknown>;
    } catch (error) {
      console.error("Failed to parse preloaded chat settings", error);
      return undefined;
    }
  }, [preload?.settingsJson, preload?.thread?.settingsJson]);
  const router = useRouter();
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(
    initialThreadId,
  );

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
      default: preload?.messages,
      skip: !currentThreadId,
    },
  );

  const thread = useQuery(
    api.functions.threads.getThread,
    { threadId: currentThreadId ?? "" },
    { skip: !currentThreadId },
  );
  const effectiveChatProjectId =
    chatProjectId ?? preload?.thread?.chatProjectId ?? thread?.chatProjectId;

  const chatSessionId = useStableClientId();
  const [chatInstanceId] = useState(() => initialThreadId ?? chatSessionId);
  const locallyCompletedStreamRef = useRef(false);
  const locallyStartedStreamRef = useRef(false);
  const locallyStoppedStreamRef = useRef<
    | {
        messageId?: string;
        streamId?: string;
      }
    | undefined
  >(undefined);
  const lastSyncedMessagesRef = useRef<UIMessage[]>([]);
  const { markAdoptedThreadNavigation } = useChatRouteAdoption();
  const {
    settings,
    baselineSettings,
    isReady: settingsReady,
    setModel,
    restoreSettings,
    updateSettings,
  } = useChatSettings(currentThreadId, initialSettings);
  const resolveAttachmentsFn = useServerFn(resolveAttachments);
  const selectThreadBranchMutation = useMutation(
    api.functions.threads.selectThreadBranch,
  );
  const editUserMessageBranch = useMutation(
    api.functions.threads.editUserMessageBranch,
  );
  const regenerateAssistantMessageBranch = useMutation(
    api.functions.threads.regenerateAssistantMessageBranch,
  );
  const abortStreamMutation = useMutation(api.functions.threads.abortStream);
  const { allocate: allocateSignedIds } = useSignedCid();
  const [editingMessageId, setEditingMessageId] = useState<string | undefined>(
    undefined,
  );

  const [initialMessages] = useState<ChatMessageWithThreadMetadata[]>(() =>
    getVisibleBranchMessages(
      (preload?.messages ?? []).map(toChatUIMessage),
      preload?.thread?.selectedLeafMessageId,
    ),
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
    regenerate,
    setMessages,
    resumeStream,
    stop,
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
        message.isAbort || (!message.isDisconnect && !message.isError);
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
      locallyStoppedStreamRef.current = undefined;

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
      locallyStoppedStreamRef.current = undefined;
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
      locallyStoppedStreamRef.current = undefined;
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
  ) as
    | { streamId: string; messageId?: string; clientId: string | undefined }
    | undefined;
  const activeStreamId = activeStreamInfo?.streamId;
  const activeStreamMessageId = activeStreamInfo?.messageId;
  const activeStreamClientId = activeStreamInfo?.clientId;

  const stopGeneration = useCallback(() => {
    console.log("stopGeneration", {
      clientId: activeStreamClientId,
      messageId: activeStreamMessageId,
      streamId: activeStreamId,
    });
    const messageId = activeStreamMessageId ?? pendingAssistantMessageId;
    locallyStartedStreamRef.current = false;
    locallyCompletedStreamRef.current = true;
    locallyStoppedStreamRef.current = {
      messageId,
      streamId: activeStreamId,
    };
    setPendingAssistantMessageId(undefined);
    void stop();
    if (!currentThreadId || !messageId) {
      return;
    }
    console.log("abortStreamMutation", messageId);
    void abortStreamMutation({
      threadId: currentThreadId,
      messageId,
    }).catch((error) => {
      console.error("Failed to abort stream:", error);
    });
  }, [
    abortStreamMutation,
    activeStreamClientId,
    activeStreamId,
    activeStreamMessageId,
    currentThreadId,
    pendingAssistantMessageId,
    stop,
  ]);

  useEffect(() => {
    const locallyStoppedStream = locallyStoppedStreamRef.current;

    if (
      activeStreamInfo?.streamId &&
      locallyStoppedStream?.streamId &&
      activeStreamInfo.streamId === locallyStoppedStream.streamId
    ) {
      return;
    }

    if (
      activeStreamInfo?.messageId &&
      locallyStoppedStream?.messageId &&
      activeStreamInfo.messageId === locallyStoppedStream.messageId
    ) {
      return;
    }

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

  const allBranchMessages = useMemo<ChatMessageWithThreadMetadata[]>(() => {
    return convexMessages?.map(toChatUIMessage) ?? [];
  }, [convexMessages]);

  const visibleBranchMessages = useMemo<ChatMessageWithThreadMetadata[]>(() => {
    return getVisibleBranchMessages(
      allBranchMessages,
      thread?.selectedLeafMessageId,
    );
  }, [allBranchMessages, thread?.selectedLeafMessageId]);

  const convexUIMessages = useMemo<ChatMessageWithThreadMetadata[]>(() => {
    return visibleBranchMessages.filter(
      (message) => message.status !== "generating",
    );
  }, [visibleBranchMessages]);

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

  const messageStatsMap = useMemo(() => {
    const map = new Map<string, MessageStats>();
    convexMessages?.forEach((m) => {
      if (m.role === "assistant") {
        map.set(m.messageId, {
          creditsConsumed: m.creditsConsumed,
          usage: m.usage,
          generationStats: m.generationStats,
          model: m.model,
        });
      }
    });
    return map;
  }, [convexMessages]);

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

  const selectBranch = useCallback(
    async (messageId: string) => {
      if (!currentThreadId || status !== "ready") {
        return;
      }

      const leafMessageId =
        getDeepestLeafForBranch(allBranchMessages, messageId) ?? messageId;

      await selectThreadBranchMutation({
        threadId: currentThreadId,
        leafMessageId,
      });

      const nextVisibleMessages = getVisibleBranchMessages(
        allBranchMessages,
        leafMessageId,
      ).filter((message) => message.status !== "generating");

      locallyStartedStreamRef.current = false;
      locallyCompletedStreamRef.current = false;
      setOptimisticMessage(undefined);
      setPendingAssistantMessageId(undefined);
      lastMessageCount.current = nextVisibleMessages.length;
      lastSyncedMessagesRef.current = nextVisibleMessages;
      setMessages(nextVisibleMessages);
    },
    [
      allBranchMessages,
      currentThreadId,
      selectThreadBranchMutation,
      setMessages,
      status,
    ],
  );

  const startEditMessage = useCallback(
    (messageId: string) => {
      if (status !== "ready") {
        return;
      }

      setEditingMessageId(messageId);
    },
    [status],
  );

  const cancelEditMessage = useCallback(() => {
    setEditingMessageId(undefined);
  }, []);

  const editMessage = useMemo(
    () =>
      editingMessageId
        ? visibleBranchMessages.find(
            (message) => message.id === editingMessageId,
          )
        : undefined,
    [editingMessageId, visibleBranchMessages],
  );

  const submitEditedMessage = useCallback(
    async (payload: {
      draftAttachmentIds: string[];
      retainedAttachmentIds: string[];
      attachmentMetadata: {
        attachmentId: string;
        convertingToPdf?: boolean;
        generatingDerivative?: boolean;
        fileName: string;
        mimeType: string;
        size: number;
        expiresAt?: number;
        url?: string;
      }[];
      text: string;
    }) => {
      if (!currentThreadId || !editMessage || status !== "ready") {
        return;
      }

      const [userMessageId, assistantMessageId] = await allocateSignedIds(2);
      if (!userMessageId || !assistantMessageId) {
        throw new Error("Failed to get message IDs");
      }

      const branchInfo = await editUserMessageBranch({
        threadId: currentThreadId,
        fromMessageId: editMessage.id,
        userMessage: {
          parts: [{ type: "text" as const, text: payload.text }],
        },
        userMessageId: userMessageId.str,
        assistantMessageId: assistantMessageId.str,
        model: settings.model,
        settings,
        retainedAttachmentIds: payload.retainedAttachmentIds,
        draftAttachmentIds: payload.draftAttachmentIds,
      });

      const editIndex = visibleBranchMessages.findIndex(
        (message) => message.id === editMessage.id,
      );
      const messagesForAPI = visibleBranchMessages
        .slice(0, editIndex < 0 ? visibleBranchMessages.length : editIndex)
        .map((message) => ({
          id: message.id,
          role: message.role,
          parts: message.parts,
        }));

      const editedUserMessage: ChatMessageWithThreadMetadata = {
        id: branchInfo.userMessageId,
        role: "user",
        parts: [{ type: "text", text: payload.text }],
        metadata: {
          attachments: payload.attachmentMetadata,
        },
      };

      const localMessages = [
        ...messagesForAPI.map((message) => ({
          ...message,
        })),
        editedUserMessage,
      ] satisfies ChatMessageWithThreadMetadata[];

      locallyStartedStreamRef.current = true;
      locallyCompletedStreamRef.current = false;
      locallyStoppedStreamRef.current = undefined;
      setOptimisticMessage(undefined);
      setPendingAssistantMessageId(branchInfo.assistantMessageId);
      lastMessageCount.current = localMessages.length;
      lastSyncedMessagesRef.current = localMessages;
      setMessages(localMessages);

      await regenerate({
        messageId: branchInfo.userMessageId,
        body: {
          threadId: branchInfo.threadId,
          assistantMessageId: branchInfo.assistantMessageId,
          messages: [
            ...messagesForAPI,
            {
              id: branchInfo.userMessageId,
              role: "user" as const,
              parts: [{ type: "text" as const, text: payload.text }],
            },
          ],
          fileIds: payload.draftAttachmentIds,
          settings,
          model: settings.model,
          id: branchInfo.assistantMessageId,
          clientId: chatSessionId,
          trigger: "regenerate-message" as const,
        },
      });
    },
    [
      allocateSignedIds,
      chatSessionId,
      currentThreadId,
      editMessage,
      editUserMessageBranch,
      regenerate,
      setMessages,
      settings,
      status,
      visibleBranchMessages,
    ],
  );

  const regenerateMessage = useCallback(
    async (message: ChatMessageWithThreadMetadata) => {
      if (!currentThreadId || status !== "ready") {
        return;
      }

      const assistantMessage =
        message.role === "assistant"
          ? message
          : visibleBranchMessages.find(
              (candidate) =>
                candidate.role === "assistant" &&
                candidate.parentId === message.id,
            );

      if (!assistantMessage) {
        return;
      }

      const [assistantMessageId] = await allocateSignedIds(1);
      if (!assistantMessageId) {
        throw new Error("Failed to get assistant message ID");
      }

      const branchInfo = await regenerateAssistantMessageBranch({
        threadId: currentThreadId,
        fromMessageId: assistantMessage.id,
        assistantMessageId: assistantMessageId.str,
        model: settings.model,
        settings,
      });

      const messageIndex = visibleBranchMessages.findIndex(
        (candidate) => candidate.id === assistantMessage.id,
      );
      const messagesForAPI = visibleBranchMessages
        .slice(
          0,
          messageIndex < 0 ? visibleBranchMessages.length : messageIndex,
        )
        .map((candidate) => ({
          id: candidate.id,
          role: candidate.role,
          parts: candidate.parts,
        }));

      setPendingAssistantMessageId(branchInfo.assistantMessageId);
      locallyStartedStreamRef.current = true;
      locallyCompletedStreamRef.current = false;
      locallyStoppedStreamRef.current = undefined;

      console.log("Regenerating assistant branch", {
        sourceAssistantMessageId: assistantMessage.id,
        newAssistantMessageId: branchInfo.assistantMessageId,
        threadId: branchInfo.threadId,
        visibleMessageIds: visibleBranchMessages.map(
          (candidate) => candidate.id,
        ),
      });

      await regenerate({
        messageId: assistantMessage.id,
        body: {
          threadId: branchInfo.threadId,
          assistantMessageId: branchInfo.assistantMessageId,
          messages: messagesForAPI,
          fileIds: [],
          settings,
          model: settings.model,
          id: branchInfo.assistantMessageId,
          clientId: chatSessionId,
          trigger: "regenerate-message" as const,
        },
      });
    },
    [
      allocateSignedIds,
      chatSessionId,
      currentThreadId,
      regenerate,
      regenerateAssistantMessageBranch,
      settings,
      status,
      visibleBranchMessages,
    ],
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
    stopGeneration,
    setOptimisticMessage,
    convexUIMessages,
    allBranchMessages,
    finalMessages,
    selectBranch,
    startEditMessage,
    cancelEditMessage,
    editMessage,
    submitEditedMessage,
    regenerateMessage,
    shouldInitializeInitialThreadScroll,
    handleInitialThreadScrollReady,
    messageStatsMap,
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
