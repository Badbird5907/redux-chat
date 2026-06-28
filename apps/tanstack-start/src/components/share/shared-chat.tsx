"use client";

import type {
  ChatMessageWithThreadMetadata,
  MessageAttachmentSummary,
  MessageStats,
  ResolvedAttachment,
} from "@/components/chat/chat-types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { GitFork, LinkIcon } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES } from "@redux/types";
import { Button } from "@redux/ui/components/button";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@redux/ui/components/message-scroller";
import { useSidebar } from "@redux/ui/components/sidebar";
import { cn } from "@redux/ui/lib/utils";

import {
  getDeepestLeafForBranch,
  getVisibleBranchMessages,
} from "@/components/chat/chat-branching";
import { ChatMessageRow } from "@/components/chat/chat-message-row";
import { toChatUIMessage } from "@/components/chat/chat-message-utils";
import { useSignedCid } from "@/components/chat/client-id";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { resolvePublicShareAttachments } from "@/server/attachments";

type PublicSharePayload =
  (typeof api.functions.threadShares.getPublicShare)["_returnType"];

export function SharedChat({
  shareId,
  preload,
}: {
  shareId: string;
  preload: PublicSharePayload | null;
}) {
  return <SharedChatContent shareId={shareId} preload={preload} />;
}

function SharedChatContent({
  shareId,
  preload,
}: {
  shareId: string;
  preload: PublicSharePayload | null;
}) {
  const liveShare = useQuery(api.functions.threadShares.getPublicShare, {
    shareId,
  });
  const recordView = useMutation(api.functions.threadShares.recordView);
  const forkShare = useMutation(api.functions.threadShares.fork);
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { state: sidebarState, collapsible: sidebarCollapsible } = useSidebar();
  const { allocate } = useSignedCid();
  const navigate = useNavigate();
  const resolveAttachmentsFn = useServerFn(resolvePublicShareAttachments);
  const share = liveShare ?? preload;
  const [forking, setForking] = useState(false);
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
  const ignoreMessageAction = useCallback(() => undefined, []);
  const [selectedLeafMessageId, setSelectedLeafMessageId] = useState<
    string | undefined
  >(undefined);
  const fixedForkCardDesktopLeft = useMemo(() => {
    if (sidebarState === "expanded") {
      return "md:left-(--sidebar-width)";
    }
    if (sidebarCollapsible === "icon") {
      return "md:left-(--sidebar-width-icon)";
    }
    return "md:left-0";
  }, [sidebarCollapsible, sidebarState]);

  useEffect(() => {
    void recordView({
      shareId,
      userAgent:
        typeof navigator === "undefined" ? undefined : navigator.userAgent,
    }).catch(() => {
      // View counting is best-effort.
    });
  }, [recordView, shareId]);

  const allBranchMessages = useMemo<ChatMessageWithThreadMetadata[]>(
    () => share?.messages.map(toChatUIMessage) ?? [],
    [share?.messages],
  );

  const finalMessages = useMemo(
    () =>
      getVisibleBranchMessages(
        allBranchMessages,
        selectedLeafMessageId ?? share?.thread.selectedLeafMessageId,
      ),
    [
      allBranchMessages,
      selectedLeafMessageId,
      share?.thread.selectedLeafMessageId,
    ],
  );

  const messageStatsMap = useMemo(() => {
    const map = new Map<string, MessageStats>();
    share?.messages.forEach((message) => {
      if (message.role === "assistant") {
        map.set(message.messageId, {
          usage: message.usage,
          generationStats: message.generationStats,
          model: message.model,
          thinkingLevel: message.thinkingLevel,
        });
      }
    });
    return map;
  }, [share?.messages]);

  const messageAttachmentsByMessageId = useMemo(() => {
    const map = new Map<string, MessageAttachmentSummary[]>();
    share?.messages.forEach((message) => {
      if (Array.isArray(message.attachments)) {
        map.set(message.messageId, message.attachments);
      }
    });
    return map;
  }, [share?.messages]);

  const assistantModelByParentMessageId = useMemo(() => {
    const map = new Map<string, string>();
    share?.messages.forEach((message) => {
      if (
        message.role === "assistant" &&
        typeof message.parentId === "string" &&
        typeof message.model === "string"
      ) {
        map.set(message.parentId, message.model);
      }
    });
    return map;
  }, [share?.messages]);

  const attachmentIds = useMemo(
    () =>
      Array.from(
        new Set(
          share?.messages.flatMap((message) =>
            Array.isArray(message.attachments)
              ? message.attachments.map((attachment) => attachment.attachmentId)
              : [],
          ) ?? [],
        ),
      ),
    [share?.messages],
  );

  useEffect(() => {
    if (attachmentIds.length === 0) {
      return;
    }

    let cancelled = false;

    void resolveAttachmentsFn({
      data: { shareId, attachmentIds },
    })
      .then((attachments) => {
        if (cancelled) return;

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
      .catch((error: unknown) => {
        console.error("Failed to resolve shared attachment URLs", error);
      });

    return () => {
      cancelled = true;
    };
  }, [attachmentIds, resolveAttachmentsFn, shareId]);

  const handleFork = useCallback(async () => {
    if (authLoading || forking) return;

    if (!isAuthenticated) {
      await navigate({ to: "/auth/sign-in" });
      return;
    }

    setForking(true);
    try {
      const [threadId] = await allocate(1);
      if (!threadId) {
        throw new Error("Failed to get thread ID");
      }

      const result = await forkShare({
        shareId,
        threadId: threadId.str,
      });
      await navigate({
        to: "/chat/$id",
        params: { id: result.threadId },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to fork thread",
      );
    } finally {
      setForking(false);
    }
  }, [
    allocate,
    authLoading,
    forkShare,
    forking,
    isAuthenticated,
    navigate,
    shareId,
  ]);

  const handleSelectBranch = useCallback(
    (messageId: string) => {
      const leafMessageId =
        getDeepestLeafForBranch(allBranchMessages, messageId) ?? messageId;
      setSelectedLeafMessageId(leafMessageId);
    },
    [allBranchMessages],
  );

  if (!share) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <LinkIcon className="text-muted-foreground mx-auto mb-3 size-8" />
          <h1 className="text-lg font-medium">Share not found</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <MessageScrollerProvider defaultScrollPosition="last-anchor">
        <MessageScroller className="relative size-full" role="log">
          <MessageScrollerViewport>
            <MessageScrollerContent className="overflow-x-hidden px-4 pt-0 pb-36">
              {finalMessages.map((message, index) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                  className="mx-auto w-full max-w-3xl min-w-0"
                >
                  <ChatMessageRow
                    assistantModelByParentMessageId={
                      assistantModelByParentMessageId
                    }
                    allBranchMessages={allBranchMessages}
                    index={index}
                    message={message}
                    messageAttachmentsByMessageId={
                      messageAttachmentsByMessageId
                    }
                    messageStats={messageStatsMap.get(message.id)}
                    onAttachmentPreview={setPreviewFile}
                    onRegenerateMessage={ignoreMessageAction}
                    onSelectBranch={handleSelectBranch}
                    onStartEditMessage={ignoreMessageAction}
                    readOnly
                    resolvedMessageAttachments={resolvedMessageAttachments}
                    status="ready"
                    totalCount={finalMessages.length}
                    userMessagePreviewMaxLines={
                      DEFAULT_USER_MESSAGE_PREVIEW_MAX_LINES
                    }
                  />
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>

      <div
        className={cn(
          "fixed right-0 bottom-6 left-0 z-20 flex justify-center px-4 transition-all duration-300",
          fixedForkCardDesktopLeft,
        )}
      >
        <div className="bg-card border-border flex w-full max-w-3xl items-center justify-between gap-4 rounded-3xl border px-4 py-3 shadow-lg">
          <div className="min-w-0">
            <p className="text-sm font-medium">Fork this shared chat</p>
            <p className="text-muted-foreground truncate text-xs">
              Continue from this thread in your own workspace.
            </p>
          </div>
          <Button
            className="shrink-0"
            onClick={() => void handleFork()}
            disabled={forking}
          >
            <GitFork className="size-4" />
            {forking ? "Forking..." : "Fork chat"}
          </Button>
        </div>
      </div>

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
    </div>
  );
}
