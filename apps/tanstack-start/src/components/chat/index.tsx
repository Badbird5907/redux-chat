"use client";

import type { TextPart, TextUIPart, UIDataTypes, UIMessage, UITools } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMutation } from "convex/react";
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  PencilIcon,
  RefreshCwIcon,
  WholeWord,
  ZapIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import Spinner from "@redux/ui/components/spinner";
import { cn } from "@redux/ui/lib/utils";

import type { TreeMessage } from "./use-message-tree";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { useQuery } from "@/lib/hooks/convex";
import { BranchSelector } from "./branch-selector";
import { useSignedCid } from "./client-id";
import { EmptyChat } from "./empty";
import { ChatInput } from "./input";
import { useBranchState } from "./use-branch-state";
import { useMessageTree } from "./use-message-tree";

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

// User message action bar (copy + edit buttons)
function UserMessageActions({
  content,
  onEdit,
  isVisible,
}: {
  content: string;
  onEdit: () => void;
  isVisible: boolean;
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

  return (
    <div
      className={cn(
        "mt-2 flex items-center gap-1 transition-opacity duration-200",
        isVisible ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        className="hover:bg-primary-foreground/20 rounded p-2 transition-colors"
        title="Copy"
        onClick={handleCopy}
      >
        {copied ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
      </button>
      <button
        className="hover:bg-primary-foreground/20 rounded p-2 transition-colors"
        title="Edit"
        onClick={onEdit}
      >
        <PencilIcon className="size-4" />
      </button>
    </div>
  );
}

function MessageStatsBar({
  stats,
  isVisible,
  content,
  isStreaming,
  onRegenerate,
}: {
  stats: MessageStats | undefined;
  isVisible: boolean;
  content?: string;
  isStreaming: boolean;
  onRegenerate?: () => void;
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
        <button
          className={cn(
            "hover:bg-muted rounded p-2 transition-colors",
            isStreaming && "hidden",
          )}
          title="Regenerate"
          onClick={onRegenerate}
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

export function Chat({
  initialThreadId,
  preload,
}: {
  initialThreadId: string | undefined;
  preload?: (typeof api.functions.threads.getThreadMessages)["_returnType"];
}) {
  const [currentThreadId, setCurrentThreadId] = useState<string | undefined>(
    initialThreadId,
  );
  const [optimisticMessage, setOptimisticMessage] = useState<
    UIMessage | undefined
  >(undefined);

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
    // const existingId =
    //   typeof window !== "undefined"
    //     ? sessionStorage.getItem("chatSessionId")
    //     : null;

    // if (existingId) {
    //   return existingId;
    // }

    // const newId = crypto.randomUUID();
    // if (typeof window !== "undefined") {
    //   sessionStorage.setItem("chatSessionId", newId);
    // }
    // return newId;
    return crypto.randomUUID();
  });

  const [initialMessages] = useState(() => preload ?? []);

  // Create transport with useMemo so it can access current state
  const transport = useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/chat",
      prepareSendMessagesRequest: ({ id, messages, trigger, messageId }) => {
        // For regenerate: messageId is the assistant message to regenerate
        // For submit: messageId is undefined, last message is the user message
        const lastMessage = messages[messages.length - 1];

        return {
          body: {
            threadId: id,
            trigger: trigger, // 'submit-message' or 'regenerate-message'
            // For submit-message: send the user message ID
            // For regenerate-message: send the assistant message ID to regenerate
            userMessageId:
              trigger === "submit-message" ? lastMessage?.id : undefined,
            messageId: trigger === "regenerate-message" ? messageId : undefined,
            fileIds: [],
            model: "gpt-4o",
            id: id,
            clientId: chatSessionId,
          },
        };
      },
      prepareReconnectToStreamRequest: () => {
        console.log("prepareReconnectToStreamRequest", currentThreadId);
        return {
          api: `/api/chat/${currentThreadId}/stream`,
        };
      },
    });
  }, [currentThreadId, chatSessionId]);

  const {
    messages,
    status,
    sendMessage,
    setMessages,
    resumeStream,
    regenerate,
  } = useChat({
    id: currentThreadId, // Stable ID - doesn't change when currentThreadId changes
    messages: initialMessages as UIMessage<unknown, UIDataTypes, UITools>[],
    transport,
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
    { skip: !currentThreadId || !!optimisticMessage },
  ) as { streamId: string; clientId: string | undefined } | undefined;

  useEffect(() => {
    // Only clear optimistic message once the useChat hook has received the user message
    // This prevents a flash of empty content during the transition from submitted to streaming
    if (
      (status === "streaming" || status === "submitted") &&
      optimisticMessage &&
      messages.length > 0
    ) {
      // Check if the user message has been added to messages
      const hasUserMessage = messages.some(
        (m) => m.id === optimisticMessage.id,
      );
      if (hasUserMessage) {
        setOptimisticMessage(undefined);
      }
    }
  }, [status, optimisticMessage, messages]);

  useEffect(() => {
    if (
      !activeStreamInfo?.streamId ||
      status === "streaming" ||
      status === "submitted"
    ) {
      return;
    }

    if (optimisticMessage) {
      return;
    }

    if (activeStreamInfo.clientId === chatSessionId) {
      console.log("Skipping resume: stream is from this client");
      return;
    }

    console.log(
      "Resuming stream from another client",
      activeStreamInfo.streamId,
    );
    console.log(chatSessionId, "vs", activeStreamInfo.clientId);
    void resumeStream();
  }, [
    activeStreamInfo,
    resumeStream,
    status,
    optimisticMessage,
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
      convexUIMessages.length > 0 &&
      !optimisticMessage
    ) {
      // Only sync if Convex has caught up (has at least as many messages as we had during streaming)
      if (convexUIMessages.length >= lastMessageCount.current) {
        console.log("Syncing messages (n,e)", convexUIMessages, messages);
        setMessages(convexUIMessages);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- messages intentionally excluded to prevent infinite loop
  }, [convexUIMessages, status, setMessages, optimisticMessage]);

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

  // Branching state
  const { selections, selectBranch, resetSelections } = useBranchState();
  const messageTree = useMessageTree(
    convexMessages as TreeMessage[] | undefined,
  );

  // Inline editing state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  // Pending regenerate state for auto-switching branches
  const [pendingRegenerate, setPendingRegenerate] = useState<{
    originalMessageId: string;
    parentId: string | undefined;
  } | null>(null);

  // Mutations for edit (regenerate now uses built-in function)
  const editMessageMutation = useMutation(api.functions.threads.editMessage);
  const { safeGetSignedId } = useSignedCid();

  // Reset branch selections when switching threads
  useEffect(() => {
    resetSelections();
  }, [currentThreadId, resetSelections]);

  // Auto-switch to new branch when regeneration completes
  useEffect(() => {
    if (pendingRegenerate && status === "ready") {
      // Regeneration completed - switch to the new branch (newest sibling)
      const siblings = messageTree.getSiblings(pendingRegenerate.parentId);
      if (siblings.length > 0) {
        // Select the newest sibling (last one)
        selectBranch(pendingRegenerate.parentId, siblings.length - 1);
      }
      setPendingRegenerate(null);
    }
  }, [status, pendingRegenerate, messageTree, selectBranch]);

  // Sync useChat messages when branch selection changes
  useEffect(() => {
    // Only sync when not streaming (to avoid interfering with active streams)
    // And only if we have explicit selections (not the default empty state)
    if (
      status !== "streaming" &&
      status !== "submitted" &&
      selections.size > 0
    ) {
      const visiblePath = messageTree.getVisiblePath(selections);
      if (visiblePath.length > 0) {
        setMessages(visiblePath as unknown as UIMessage[]);
      }
    }
  }, [selections, messageTree, status, setMessages]);

  const finalMessages = useMemo(() => {
    // During streaming or when we have an optimistic message, use the useChat messages
    if (status === "streaming" || status === "submitted" || optimisticMessage) {
      if (optimisticMessage && messages.length > 0) {
        if (
          messages.at(-1)?.role === "user" ||
          (messages.at(-2)?.metadata as Record<string, unknown> | undefined)
            ?.tempReduxMessageId === optimisticMessage.id
        ) {
          // our message has shown up
          return messages;
        }
      }
      return [...messages, optimisticMessage].filter((m): m is UIMessage =>
        Boolean(m),
      );
    }

    // When not streaming, compute visible path from tree based on branch selections
    const visiblePath = messageTree.getVisiblePath(selections);
    return visiblePath as unknown as UIMessage[];
  }, [messages, optimisticMessage, status, messageTree, selections]);

  // Handle starting edit mode
  const handleStartEdit = useCallback((messageId: string, content: string) => {
    setEditingMessageId(messageId);
    setEditContent(content);
  }, []);

  // Handle submitting an edit
  const handleSubmitEdit = useCallback(async () => {
    if (!editingMessageId || !currentThreadId || !editContent.trim()) return;

    try {
      // Get signed message ID
      const [signedId] = await safeGetSignedId(1);
      if (!signedId) throw new Error("Failed to get signed ID");

      // Create the edited message
      const result = await editMessageMutation({
        threadId: currentThreadId,
        originalMessageId: editingMessageId,
        newMessageId: signedId.str,
        parts: [{ type: "text", text: editContent.trim() }] as TextPart[],
      });

      // Clear edit state
      setEditingMessageId(null);
      setEditContent("");

      // Get the message to find its parent for branch selection update
      const originalMessage = messageTree.getMessageById(editingMessageId);
      if (originalMessage) {
        // Update branch selection to show new branch
        const siblings = messageTree.getSiblings(originalMessage.parentId);
        selectBranch(originalMessage.parentId, siblings.length); // New message will be at this index
      }

      // For edit, make a direct fetch call to the API
      // Don't pass clientId so resumeStream can pick up the stream
      void fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          threadId: result.threadId,
          userMessageId: result.messageId,
          fileIds: [],
          model: "gpt-4o", // TODO: Get from thread settings
          id: result.threadId,
          // clientId intentionally omitted so resumeStream picks up the stream
          trigger: "edit-message",
        }),
      });
      // The UI will update through resumeStream when the stream starts
    } catch (error) {
      console.error("Failed to edit message:", error);
    }
  }, [
    editingMessageId,
    currentThreadId,
    editContent,
    safeGetSignedId,
    editMessageMutation,
    messageTree,
    selectBranch,
  ]);

  // Handle regenerating an assistant message
  const handleRegenerate = useCallback(
    (assistantMessageId: string) => {
      // Get the original message to find its parent for tracking
      const origMessage = messageTree.getMessageById(assistantMessageId);
      if (origMessage) {
        setPendingRegenerate({
          originalMessageId: assistantMessageId,
          parentId: origMessage.parentId,
        });
      }

      // Use the built-in regenerate function from useChat
      // The transport will handle sending the correct request
      regenerate({ messageId: assistantMessageId });
    },
    [messageTree, regenerate],
  );

  // Handle branch navigation
  const handleBranchPrev = useCallback(
    (parentId: string | undefined, currentIndex: number) => {
      if (currentIndex > 0) {
        selectBranch(parentId, currentIndex - 1);
      }
    },
    [selectBranch],
  );

  const handleBranchNext = useCallback(
    (
      parentId: string | undefined,
      currentIndex: number,
      totalSiblings: number,
    ) => {
      if (currentIndex < totalSiblings - 1) {
        selectBranch(parentId, currentIndex + 1);
      }
    },
    [selectBranch],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Conversation className="relative size-full">
        <ConversationContent className="pt-0 pb-36">
          <div className="mx-auto w-full max-w-3xl">
            {!currentThreadId && finalMessages.length === 0 ? (
              <EmptyChat
                threadId={currentThreadId}
                setThreadId={(id: string) => {
                  setCurrentThreadId(id);
                  lastMessageCount.current = 0;
                  window.history.replaceState({}, "", `/chat/${id}`);
                }}
                setOptimisticMessage={setOptimisticMessage}
                sendMessage={sendMessage}
                clientId={chatSessionId}
              />
            ) : (
              <div className="flex flex-col gap-8">
                {finalMessages.map((message, i) => {
                  const textParts = message.parts.filter(isTextPart);
                  const textContent = textParts
                    .map((part) => part.text)
                    .join("");
                  // Check if this is the last assistant message and we're streaming
                  const isLastMessage = i === finalMessages.length - 1;
                  const isStreamingAssistant =
                    status === "streaming" &&
                    message.role === "assistant" &&
                    isLastMessage;
                  // Hide bottom bar only for the currently streaming message
                  const shouldHideBottomBar = isStreamingAssistant;
                  const messageStats = messageStatsMap.get(message.id);
                  const isHovered = hoveredMessageId === message.id;
                  const isEditing = editingMessageId === message.id;

                  // Get sibling info for branch selector
                  const treeMessage = message as unknown as TreeMessage;
                  const siblings = messageTree.getSiblings(
                    treeMessage.parentId,
                  );
                  const hasBranches = siblings.length > 1;
                  const currentBranchIndex = treeMessage.siblingIndex ?? 0;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex w-full",
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start",
                      )}
                      onMouseEnter={() => setHoveredMessageId(message.id)}
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
                        {/* Inline edit mode for user messages */}
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="border-primary-foreground/30 focus:ring-primary-foreground/50 min-h-[80px] w-full resize-none rounded-lg border bg-transparent p-2 text-sm focus:ring-1 focus:outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault();
                                  void handleSubmitEdit();
                                }
                                if (e.key === "Escape") {
                                  setEditingMessageId(null);
                                  setEditContent("");
                                }
                              }}
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => void handleSubmitEdit()}
                                disabled={!editContent.trim()}
                              >
                                Save & Submit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditContent("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {!message.parts.length && (
                              <Spinner className="size-4" />
                            )}
                            <Streamdown
                              mode={
                                isStreamingAssistant ? "streaming" : "static"
                              }
                            >
                              {textContent}
                            </Streamdown>
                          </>
                        )}

                        {/* User message actions (copy + edit) */}
                        {message.role === "user" && !isEditing && (
                          <div className="flex items-center justify-between gap-2">
                            <UserMessageActions
                              content={textContent}
                              onEdit={() =>
                                handleStartEdit(message.id, textContent)
                              }
                              isVisible={isHovered && !shouldHideBottomBar}
                            />
                            {hasBranches && (
                              <BranchSelector
                                current={currentBranchIndex}
                                total={siblings.length}
                                onPrev={() =>
                                  handleBranchPrev(
                                    treeMessage.parentId,
                                    currentBranchIndex,
                                  )
                                }
                                onNext={() =>
                                  handleBranchNext(
                                    treeMessage.parentId,
                                    currentBranchIndex,
                                    siblings.length,
                                  )
                                }
                                visible={isHovered && !shouldHideBottomBar}
                              />
                            )}
                          </div>
                        )}

                        {/* Assistant message stats bar with regenerate */}
                        {message.role === "assistant" && (
                          <div className="flex items-center justify-between gap-2">
                            <MessageStatsBar
                              stats={messageStats}
                              isVisible={isHovered && !shouldHideBottomBar}
                              content={textContent}
                              isStreaming={
                                isStreamingAssistant && isLastMessage
                              }
                              onRegenerate={() =>
                                void handleRegenerate(message.id)
                              }
                            />
                            {hasBranches && (
                              <BranchSelector
                                current={currentBranchIndex}
                                total={siblings.length}
                                onPrev={() =>
                                  handleBranchPrev(
                                    treeMessage.parentId,
                                    currentBranchIndex,
                                  )
                                }
                                onNext={() =>
                                  handleBranchNext(
                                    treeMessage.parentId,
                                    currentBranchIndex,
                                    siblings.length,
                                  )
                                }
                                visible={isHovered && !shouldHideBottomBar}
                              />
                            )}
                          </div>
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
        setOptimisticMessage={setOptimisticMessage}
        setThreadId={(id) => {
          setCurrentThreadId(id);
          lastMessageCount.current = 0;
          window.history.replaceState({}, "", `/chat/${id}`);
        }}
        sendMessage={sendMessage}
        messages={messages}
        status={status}
        clientId={chatSessionId}
        parentMessageId={finalMessages.at(-1)?.id}
      />
    </div>
  );
}
