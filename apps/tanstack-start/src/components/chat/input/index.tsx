import type { DraftAttachment } from "@/components/chat/use-chat-draft";
import type { QueuedMessage } from "@/components/chat/use-message-queue";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { isTextUIPart } from "ai";
import { useConvexAuth, useMutation } from "convex/react";
import { XIcon } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";
import { estimateTokenCount, splitByTokens } from "tokenx";

import type { ThinkingLevel } from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";
import {
  classifyChatAttachment,
  DEFAULT_IMAGE_GENERATION_MODEL_ID,
  getChatModelConfig,
  getImageGenerationToolModels,
  resolveModelAttachmentDelivery,
  resolveModelRoute,
} from "@redux/shared/models";
import { getEnabledToolSettings, isToolEnabled } from "@redux/types";
import { useSidebar } from "@redux/ui/components/sidebar";
import { cn } from "@redux/ui/lib/utils";

import type { ChatInputProps, PreviewableFile } from "./types";
import { AddCreditsDialog } from "@/components/billing/add-credits-dialog";
import { useSignedCid } from "@/components/chat/client-id";
import { FilePreviewDialog } from "@/components/chat/file-preview";
import { FOCUS_COMPOSER_EVENT } from "@/components/chat/focus-composer";
import { useChatDraft } from "@/components/chat/use-chat-draft";
import {
  snapshotAttachmentsForQueue,
  useMessageQueue,
} from "@/components/chat/use-message-queue";
import { submitMessage } from "@/components/chat/use-submit-message";
import { useQuery } from "@/lib/hooks/convex";
import { useInstructions } from "@/lib/hooks/use-instructions";
import { useAppHotkey } from "@/lib/hotkeys";
import { deleteDraftAttachment } from "@/server/attachments";
import {
  FREE_PLAN_MAX_ATTACHMENTS,
  FREE_PLAN_MAX_FILE_SIZE_BYTES,
} from "@/upload";
import { useBillingState } from "../use-billing-state";
import { ChatInputAttachmentsBar } from "./attachments-bar";
import { ChatInputEditorSection } from "./editor-section";
import { ChatInputToolbar } from "./input-toolbar";
import { MessageQueueCard } from "./message-queue-card";
import { useFileUpload } from "./use-file-upload";
import { isAttachmentExpired } from "./utils";

export function ChatInput({
  threadId,
  chatProjectId,
  setThreadId,
  sendMessage,
  setOptimisticMessage,
  messages: _messages,
  status,
  clientId,
  convexMessages,
  settings,
  settingsReady,
  onModelChange,
  onSettingsChange,
  editMessage,
  onCancelEdit,
  onSubmitEdit,
  onStopGeneration,
}: ChatInputProps) {
  const {
    text: input,
    setText: setInput,
    attachments,
    isReady: draftReady,
    appendAttachment,
    updateAttachment,
    removeAttachment,
    setAttachments,
    clearDraft,
  } = useChatDraft({
    threadId,
    settingsReady,
    persistDraft: !editMessage,
  });
  const [previewFile, setPreviewFile] = useState<PreviewableFile | null>(null);
  const [showTokenVisualization, setShowTokenVisualization] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [addCreditsOpen, setAddCreditsOpen] = useState(false);
  const navigate = useNavigate();
  const posthog = usePostHog();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const visualizationRef = useRef<HTMLDivElement>(null);
  const { allocate: allocateSignedIds } = useSignedCid();
  const { state: sidebarState, collapsible: sidebarCollapsible } = useSidebar();
  const {
    instructions,
    instructionsById,
    defaultInstruction,
    isReady: instructionsReady,
  } = useInstructions();
  const mcpServers =
    useQuery(api.functions.mcpServers.list, {}, { default: [] }) ?? [];
  const { billingState, isOutOfCredits } = useBillingState();
  const isPaidPlan =
    billingState?.tier === "plus" || billingState?.tier === "pro";
  const attachmentLimits =
    billingState?.tier === "free"
      ? {
          maxPerMessage: FREE_PLAN_MAX_ATTACHMENTS,
          maxFileSizeBytes: FREE_PLAN_MAX_FILE_SIZE_BYTES,
        }
      : null;

  const createMessage = useMutation(api.functions.threads.sendMessage);
  const deleteDraftAttachmentFn = useServerFn(deleteDraftAttachment);
  const {
    queue,
    enqueue,
    removeQueued,
    updateQueued,
    moveQueuedToFront,
    consumeHead,
    takeQueued,
    prependQueued,
  } = useMessageQueue({ threadId });
  const prevStatusRef = useRef(status);
  const flushInProgressRef = useRef(false);
  const submitInProgressRef = useRef(false);
  const submitNewUserPayloadRef = useRef<
    (text: string, att: DraftAttachment[]) => Promise<boolean>
  >(() => Promise.resolve(false));

  const editingMessageIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!editMessage || editingMessageIdRef.current === editMessage.id) {
      return;
    }

    editingMessageIdRef.current = editMessage.id;
    setInput(
      editMessage.parts
        .filter(isTextUIPart)
        .map((part) => part.text)
        .join(""),
    );
    setAttachments(
      (editMessage.attachments ?? []).map((attachment) => ({
        attachmentId: attachment.attachmentId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        expiresAt: attachment.expiresAt,
        source: "retained" as const,
        uploading: false,
        url: attachment.url,
      })),
    );
  }, [editMessage, setAttachments, setInput]);

  useEffect(() => {
    if (editMessage) {
      return;
    }

    editingMessageIdRef.current = undefined;
  }, [editMessage]);

  useEffect(() => {
    if (!draftReady || typeof document === "undefined") {
      return;
    }

    const activeElement = document.activeElement;
    const canTakeInitialFocus =
      activeElement === null ||
      activeElement === document.body ||
      activeElement === document.documentElement;

    if (!canTakeInitialFocus) {
      return;
    }

    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [draftReady]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onFocusComposer = () => {
      window.requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    };

    window.addEventListener(FOCUS_COMPOSER_EVENT, onFocusComposer);
    return () => {
      window.removeEventListener(FOCUS_COMPOSER_EVENT, onFocusComposer);
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      if (isExpanded) {
        textarea.style.height = "";
        return;
      }

      const previousHeight = textarea.style.height;
      const previousDisplay = textarea.style.display;

      if (showTokenVisualization) {
        textarea.style.display = "block";
        textarea.style.position = "absolute";
        textarea.style.visibility = "hidden";
        textarea.style.height = "auto";
      } else {
        textarea.style.height = "auto";
      }

      const lineHeight = 24;
      const maxHeight = lineHeight * 10;
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);

      setTextareaHeight(newHeight);

      if (showTokenVisualization) {
        textarea.style.height = previousHeight;
        textarea.style.display = previousDisplay;
        textarea.style.position = "";
        textarea.style.visibility = "";
      } else {
        textarea.style.height = `${newHeight}px`;
      }
    }
  }, [input, showTokenVisualization, isExpanded]);

  const visualizationHeight = useMemo(() => {
    if (!showTokenVisualization || !textareaHeight) return null;
    const lineHeight = 24;
    const maxHeight = lineHeight * 10;
    return Math.min(textareaHeight, maxHeight);
  }, [showTokenVisualization, textareaHeight]);

  const selectedModel = settings.model;
  const isSearchEnabled = isToolEnabled(settings.tools, "search");
  const isBashWorkspaceEnabled = isToolEnabled(settings.tools, "bashWorkspace");
  const isAnalysisWorkspaceEnabled = isToolEnabled(
    settings.tools,
    "analysisWorkspace",
  );
  const imageGenerationModels = useMemo(
    () =>
      getImageGenerationToolModels().map((model) => ({
        id: model.id,
        name: model.name,
      })),
    [],
  );
  const imageGenerationSettings = getEnabledToolSettings(
    settings.tools,
    "imageGeneration",
  );
  const selectedImageGenerationModelId =
    imageGenerationSettings?.modelId ?? DEFAULT_IMAGE_GENERATION_MODEL_ID;
  const isImageGenerationEnabled = isToolEnabled(
    settings.tools,
    "imageGeneration",
  );
  const enabledMcpServerIds = useMemo(
    () =>
      getEnabledToolSettings(settings.tools, "mcpServers")?.serverIds ?? [],
    [settings.tools.mcpServers],
  );
  const showErrorBorder = status === "error";
  const selectedInstruction =
    (settings.instructionId
      ? instructionsById.get(settings.instructionId)
      : undefined) ?? defaultInstruction;
  const currentModelConfig = getChatModelConfig(selectedModel);
  const currentModelRoute = resolveModelRoute(selectedModel);
  const availableThinkingLevels = currentModelConfig?.thinkingLevels ?? [];
  const effectiveThinkingLevel: ThinkingLevel =
    settings.thinkingLevel &&
    availableThinkingLevels.includes(settings.thinkingLevel)
      ? settings.thinkingLevel
      : (currentModelConfig?.defaultThinkingLevel ?? "low");
  const canConfigureReasoning =
    !!currentModelConfig?.supports.reasoning &&
    availableThinkingLevels.length > 0;
  const acceptedFileTypes = currentModelConfig?.accept.join(",") ?? "";
  const isSubmitting = status === "streaming" || status === "submitted";
  const canUploadFiles =
    !isSubmitting &&
    !!currentModelConfig &&
    currentModelConfig.accept.length > 0 &&
    settingsReady &&
    draftReady;

  const attachmentUsesDerivative = useCallback(
    (attachment: { fileName: string; mimeType: string }) => {
      if (!currentModelRoute) {
        return false;
      }

      const deliveryMode = resolveModelAttachmentDelivery(
        currentModelRoute.id,
        {
          name: attachment.fileName,
          type: attachment.mimeType,
        },
      );
      if (!deliveryMode) {
        return false;
      }

      if (deliveryMode !== "native") {
        return true;
      }

      return (
        classifyChatAttachment(attachment) === "pdf" &&
        !currentModelRoute.modalities.input.includes("pdf")
      );
    },
    [currentModelRoute],
  );

  const beforeOpenFilePicker = useCallback(() => {
    setDropdownOpen(false);
  }, []);

  const {
    fileInputRef,
    handleFileSelect,
    handlePasteFiles,
    openFilePicker,
    dropHighlightLayer,
  } = useFileUpload({
    threadId,
    selectedModel,
    currentModelConfig,
    canUploadFiles,
    appendAttachment,
    updateAttachment,
    setAttachments,
    beforeOpenFilePicker,
    attachmentLimits,
    currentAttachmentCount: attachments.length,
  });

  useAppHotkey("chat.uploadFile", () => {
    openFilePicker();
  });

  const handleRemoveAttachment = useCallback(
    async (attachmentId: string) => {
      try {
        await removeAttachment(attachmentId);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to remove attachment",
        );
      }
    },
    [removeAttachment],
  );

  const handleSearchEnabledChange = useCallback(
    (enabled: boolean) => {
      void onSettingsChange({
        tools: {
          search: enabled ? {} : false,
        },
      });
    },
    [onSettingsChange],
  );

  const handleAnalysisWorkspaceEnabledChange = useCallback(
    (enabled: boolean) => {
      void onSettingsChange({
        tools: {
          analysisWorkspace: enabled ? { syncUploads: true } : false,
        },
      });
    },
    [onSettingsChange],
  );

  const handleImageGenerationEnabledChange = useCallback(
    (enabled: boolean) => {
      void onSettingsChange({
        tools: {
          imageGeneration:
            enabled && selectedImageGenerationModelId
              ? { modelId: selectedImageGenerationModelId }
              : false,
        },
      });
    },
    [onSettingsChange, selectedImageGenerationModelId],
  );

  const handleImageGenerationModelChange = useCallback(
    (modelId: string) => {
      void onSettingsChange({
        tools: {
          imageGeneration: { modelId },
        },
      });
    },
    [onSettingsChange],
  );

  const handleBashWorkspaceEnabledChange = useCallback(
    (enabled: boolean) => {
      void onSettingsChange({
        tools: {
          bashWorkspace: enabled ? {} : false,
        },
      });
    },
    [onSettingsChange],
  );

  const handleInstructionChange = useCallback(
    (instructionId: string) => {
      void onSettingsChange({
        instructionId: instructionId === "" ? undefined : instructionId,
      });
      setDropdownOpen(false);
    },
    [onSettingsChange],
  );

  const handleThinkingLevelChange = useCallback(
    (thinkingLevel: ThinkingLevel) => {
      void onSettingsChange({ thinkingLevel });
    },
    [onSettingsChange],
  );

  const handleModelChange = useCallback(
    async (modelId: string) => {
      try {
        const nextSettings = await onModelChange(modelId);
        const nextModelConfig = getChatModelConfig(modelId);
        const nextThinkingLevels = nextModelConfig?.thinkingLevels ?? [];

        if (
          !nextModelConfig?.supports.reasoning ||
          nextThinkingLevels.length === 0
        ) {
          return;
        }

        if (
          nextSettings.thinkingLevel &&
          nextThinkingLevels.includes(nextSettings.thinkingLevel)
        ) {
          return;
        }

        void onSettingsChange({
          thinkingLevel: nextModelConfig.defaultThinkingLevel ?? "low",
        });
      } catch (error) {
        console.error("Failed to change model:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to change model",
        );
      }
    },
    [onModelChange, onSettingsChange],
  );

  const handleToggleMcpServer = useCallback(
    (mcpServerId: string) => {
      const nextServerIds = enabledMcpServerIds.includes(mcpServerId)
        ? enabledMcpServerIds.filter((serverId) => serverId !== mcpServerId)
        : [...enabledMcpServerIds, mcpServerId];

      void onSettingsChange({
        tools: {
          mcpServers: { serverIds: nextServerIds },
        },
      });
    },
    [enabledMcpServerIds, onSettingsChange],
  );

  const discardDraftAttachmentForQueue = useCallback(
    async (attachment: DraftAttachment) => {
      if (attachment.source === "retained") {
        return;
      }

      try {
        await deleteDraftAttachmentFn({
          data: { attachmentId: attachment.attachmentId },
        });
      } catch (error) {
        console.error("Failed to delete draft attachment from queue:", error);
      }
    },
    [deleteDraftAttachmentFn],
  );

  const canSubmitAuthenticatedMessage = useCallback(() => {
    if (isAuthLoading) {
      return false;
    }

    if (!isAuthenticated) {
      void navigate({ to: "/auth/sign-up" });
      return false;
    }

    return true;
  }, [isAuthenticated, isAuthLoading, navigate]);

  const submitNewUserPayload = useCallback(
    async (
      messageContent: string,
      attachmentsList: DraftAttachment[],
    ): Promise<boolean> => {
      const trimmed = messageContent.trim();
      const expiredAttachments = attachmentsList.filter(
        (attachment) =>
          !attachment.uploading && isAttachmentExpired(attachment.expiresAt),
      );
      const currentAttachments = attachmentsList.filter(
        (attachment) =>
          attachment.uploading || !isAttachmentExpired(attachment.expiresAt),
      );

      if (expiredAttachments.length > 0) {
        toast.error(
          expiredAttachments.length === 1
            ? "An attachment expired and was removed."
            : "Some attachments expired and were removed.",
        );

        return false;
      }

      if (!trimmed && currentAttachments.length === 0) {
        return false;
      }

      if (!canSubmitAuthenticatedMessage()) {
        return false;
      }

      if (isOutOfCredits) {
        toast.error("You are out of credits.");
        return false;
      }

      if (status !== "ready") {
        return false;
      }

      if (!settingsReady || !draftReady) {
        return false;
      }

      if (attachmentsList.some((attachment) => attachment.uploading)) {
        return false;
      }

      const attachmentsUsingDerivative = currentAttachments.filter(
        attachmentUsesDerivative,
      );

      if (attachmentsUsingDerivative.length > 0) {
        toast("Preparing attached files for model compatibility. Please wait.");
      }

      try {
        await submitMessage({
          messageContent: trimmed,
          threadId,
          chatProjectId,
          setThreadId,
          settings,
          clientId,
          attachmentIds: currentAttachments.map(
            (attachment) => attachment.attachmentId,
          ),
          attachmentMetadata: currentAttachments.map((attachment) => ({
            attachmentId: attachment.attachmentId,
            generatingDerivative: attachmentsUsingDerivative.some(
              (candidate) => candidate.attachmentId === attachment.attachmentId,
            ),
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            expiresAt: attachment.expiresAt,
            url: attachment.url,
          })),
          allocateSignedIds,
          createMessage,
          setOptimisticMessage,
          sendMessage,
          convexMessages,
          parentMessageId: _messages.at(-1)?.id,
        });

        posthog.capture("message_sent", {
          model: settings.model,
          is_new_thread: !threadId,
          has_attachments: currentAttachments.length > 0,
          attachment_count: currentAttachments.length,
        });

        return true;
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to send message",
        );
        console.error("Failed to send message:", error);

        return false;
      }
    },
    [
      _messages,
      allocateSignedIds,
      attachmentUsesDerivative,
      chatProjectId,
      clientId,
      canSubmitAuthenticatedMessage,
      convexMessages,
      createMessage,
      draftReady,
      sendMessage,
      setOptimisticMessage,
      setThreadId,
      settings,
      settingsReady,
      status,
      threadId,
      isOutOfCredits,
    ],
  );

  useEffect(() => {
    submitNewUserPayloadRef.current = submitNewUserPayload;
  }, [submitNewUserPayload]);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (editMessage || status !== "ready") {
      return;
    }

    if (prev !== "streaming" && prev !== "submitted") {
      return;
    }

    if (flushInProgressRef.current) {
      return;
    }

    const head = consumeHead();
    if (!head) {
      return;
    }

    flushInProgressRef.current = true;
    void submitNewUserPayloadRef
      .current(head.text, head.attachments)
      .then((success) => {
        if (!success) {
          prependQueued(head);
        }
      })
      .finally(() => {
        flushInProgressRef.current = false;
      });
  }, [consumeHead, editMessage, prependQueued, status]);

  const discardQueuedMessage = useCallback(
    async (message: QueuedMessage) => {
      await Promise.all(
        message.attachments.map((attachment) =>
          discardDraftAttachmentForQueue(attachment),
        ),
      );
      removeQueued(message.id);
    },
    [discardDraftAttachmentForQueue, removeQueued],
  );

  const restoreQueuedIntoComposer = useCallback(
    (message: QueuedMessage) => {
      const taken = takeQueued(message.id);

      if (!taken) {
        return;
      }

      setInput(taken.text);
      setAttachments(taken.attachments);
      queueMicrotask(() => textareaRef.current?.focus());
    },
    [setAttachments, setInput, takeQueued],
  );

  const handleSaveQueuedEdit = useCallback(
    async (
      messageId: string,
      draft: Pick<QueuedMessage, "text" | "attachments">,
    ) => {
      const existing = queue.find((candidate) => candidate.id === messageId);

      if (!existing) {
        return;
      }

      const nextIds = new Set(
        draft.attachments.map((attachment) => attachment.attachmentId),
      );

      await Promise.all(
        existing.attachments
          .filter(
            (attachment) =>
              !nextIds.has(attachment.attachmentId) &&
              attachment.source !== "retained",
          )
          .map((attachment) => discardDraftAttachmentForQueue(attachment)),
      );

      updateQueued(messageId, draft);
    },
    [discardDraftAttachmentForQueue, queue, updateQueued],
  );

  const handlePromoteQueued = useCallback(
    async (message: QueuedMessage) => {
      if (!editMessage && status === "ready") {
        const taken = takeQueued(message.id);

        if (!taken) {
          return;
        }

        const success = await submitNewUserPayload(
          taken.text,
          taken.attachments,
        );

        if (!success) {
          prependQueued(taken);
        }

        return;
      }

      moveQueuedToFront(message.id);
    },
    [
      editMessage,
      moveQueuedToFront,
      prependQueued,
      status,
      submitNewUserPayload,
      takeQueued,
    ],
  );

  const handleSubmit = useCallback(async () => {
    const expiredAttachments = attachments.filter(
      (attachment) =>
        !attachment.uploading && isAttachmentExpired(attachment.expiresAt),
    );
    const currentAttachments = attachments.filter(
      (attachment) =>
        attachment.uploading || !isAttachmentExpired(attachment.expiresAt),
    );

    if (expiredAttachments.length > 0) {
      setAttachments(currentAttachments);
      toast.error(
        expiredAttachments.length === 1
          ? "An attachment expired and was removed."
          : "Some attachments expired and were removed.",
      );
    }

    if (!input.trim() && currentAttachments.length === 0) {
      return;
    }

    if (!canSubmitAuthenticatedMessage()) {
      return;
    }

    if (isOutOfCredits) {
      toast.error("You are out of credits.");
      return;
    }

    if (!settingsReady || !draftReady) {
      return;
    }

    if (attachments.some((attachment) => attachment.uploading)) {
      return;
    }

    if (!editMessage && (status === "streaming" || status === "submitted")) {
      enqueue({
        text: input.trim(),
        attachments: snapshotAttachmentsForQueue(currentAttachments),
      });

      toast.success("Message queued");

      clearDraft();

      return;
    }

    if (status !== "ready") {
      return;
    }

    if (submitInProgressRef.current) {
      return;
    }

    submitInProgressRef.current = true;

    if (isExpanded) {
      setIsExpanded(false);
    }

    const attachmentsUsingDerivative = currentAttachments.filter(
      attachmentUsesDerivative,
    );

    if (attachmentsUsingDerivative.length > 0) {
      toast("Preparing attached files for model compatibility. Please wait.");
    }

    try {
      if (editMessage && threadId) {
        const retainedAttachmentIds = currentAttachments
          .filter((attachment) => attachment.source === "retained")
          .map((attachment) => attachment.attachmentId);
        const draftAttachmentIds = currentAttachments
          .filter((attachment) => attachment.source !== "retained")
          .map((attachment) => attachment.attachmentId);

        await onSubmitEdit?.({
          retainedAttachmentIds,
          draftAttachmentIds,
          text: input,
          attachmentMetadata: currentAttachments.map((attachment) => ({
            attachmentId: attachment.attachmentId,
            generatingDerivative: attachmentsUsingDerivative.some(
              (candidate) => candidate.attachmentId === attachment.attachmentId,
            ),
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            size: attachment.size,
            expiresAt: attachment.expiresAt,
            url: attachment.url,
          })),
        });
        onCancelEdit?.();
      } else {
        const success = await submitNewUserPayload(
          input.trim(),
          currentAttachments,
        );

        if (!success) {
          return;
        }
      }

      clearDraft();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send message",
      );
      console.error("Failed to send message:", error);
    } finally {
      submitInProgressRef.current = false;
    }
  }, [
    attachments,
    attachmentUsesDerivative,
    canSubmitAuthenticatedMessage,
    clearDraft,
    draftReady,
    editMessage,
    enqueue,
    input,
    isExpanded,
    onCancelEdit,
    onSubmitEdit,
    setAttachments,
    settingsReady,
    status,
    submitNewUserPayload,
    threadId,
    isOutOfCredits,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
    },
    [handleSubmit],
  );

  const hasUploadingFiles = attachments.some(
    (attachment) => attachment.uploading,
  );
  const hasUsableAttachments = attachments.some(
    (attachment) =>
      !attachment.uploading && !isAttachmentExpired(attachment.expiresAt),
  );

  const tokenCount = useMemo(() => {
    if (!input.trim()) return 0;
    return estimateTokenCount(input);
  }, [input]);

  const tokenizedText = useMemo(() => {
    if (!showTokenVisualization || !input.trim()) return [];
    return splitByTokens(input, 1);
  }, [input, showTokenVisualization]);

  const handleTokenCountClick = useCallback(() => {
    if (input.trim()) {
      setShowTokenVisualization(!showTokenVisualization);
    }
  }, [input, showTokenVisualization]);

  const isContentOverflowing = useMemo(() => {
    if (!textareaHeight) return false;
    const lineHeight = 24;
    const maxHeight = lineHeight * 10;
    return textareaHeight >= maxHeight;
  }, [textareaHeight]);

  const toggleExpand = useCallback(() => {
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const fixedInputDesktopLeft = useMemo(() => {
    if (sidebarState === "expanded") {
      return "md:left-(--sidebar-width)";
    }
    if (sidebarCollapsible === "icon") {
      return "md:left-(--sidebar-width-icon)";
    }
    return "md:left-0";
  }, [sidebarCollapsible, sidebarState]);

  return (
    <>
      {dropHighlightLayer}
      {isExpanded && (
        <div
          className="bg-background/80 animate-in fade-in fixed inset-0 z-40 backdrop-blur-sm duration-300"
          onClick={toggleExpand}
        />
      )}
      <div
        className={cn(
          "fixed flex justify-center transition-all duration-300",
          isExpanded
            ? "inset-4 z-50"
            : cn("right-0 bottom-6 left-0 px-4", fixedInputDesktopLeft),
        )}
      >
        <div
          className={cn(
            "flex w-full flex-col transition-all duration-300",
            isExpanded ? "h-full" : "max-w-3xl",
          )}
        >
          {!editMessage && queue.length > 0 ? (
            <MessageQueueCard
              onDiscard={(message) => void discardQueuedMessage(message)}
              onEditInComposer={restoreQueuedIntoComposer}
              queue={queue}
              onPromote={(message) => void handlePromoteQueued(message)}
              onPreviewAttachment={setPreviewFile}
              onSaveEdit={handleSaveQueuedEdit}
            />
          ) : null}
          {isOutOfCredits ? (
            <div
              className="border-destructive/40 bg-destructive/10 text-destructive mb-2 rounded-2xl border px-4 py-3 text-sm shadow-lg backdrop-blur"
              role="alert"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">You are out of credits.</p>
                  <p className="mt-1 text-xs opacity-90">
                    {isPaidPlan
                      ? "Add credits to keep chatting."
                      : "Upgrade to keep chatting."}
                  </p>
                </div>
                <button
                  type="button"
                  className="bg-background text-foreground hover:bg-muted inline-flex h-8 shrink-0 items-center justify-center rounded-md px-3 text-xs font-medium transition-colors"
                  onClick={() => {
                    if (isPaidPlan) {
                      setAddCreditsOpen(true);
                      return;
                    }
                    void navigate({ to: "/settings" });
                  }}
                >
                  {isPaidPlan ? "Add credits" : "View plans"}
                </button>
              </div>
            </div>
          ) : null}
          <div
            className={cn(
              "bg-card border-border relative z-10 flex flex-col overflow-hidden border shadow-lg transition-all duration-300",
              isExpanded ? "h-full rounded-2xl" : "rounded-3xl",
              status === "streaming" && "border-primary",
              status === "submitted" && "border-amber-400",
              showErrorBorder && "border-destructive",
            )}
          >
            {editMessage && (
              <div className="border-border bg-muted/40 flex items-center justify-between border-b px-4 py-2 text-sm">
                <span className="text-muted-foreground">Editing message</span>
                <button
                  type="button"
                  className="hover:bg-muted rounded p-1 transition-colors"
                  onClick={() => {
                    clearDraft();
                    onCancelEdit?.();
                  }}
                  title="Cancel edit"
                >
                  <XIcon className="size-4" />
                </button>
              </div>
            )}
            <ChatInputAttachmentsBar
              attachments={attachments}
              onPreview={setPreviewFile}
              onRemove={handleRemoveAttachment}
            />

            <ChatInputEditorSection
              showTokenVisualization={showTokenVisualization}
              isExpanded={isExpanded}
              input={input}
              setInput={setInput}
              textareaRef={textareaRef}
              visualizationRef={visualizationRef}
              visualizationHeight={visualizationHeight}
              tokenizedText={tokenizedText}
              onKeyDown={handleKeyDown}
              onPasteFiles={handlePasteFiles}
              draftReady={draftReady}
              onCloseTokenVisualization={() => setShowTokenVisualization(false)}
            />

            <ChatInputToolbar
              fileInputRef={fileInputRef}
              acceptedFileTypes={acceptedFileTypes}
              onFileChange={handleFileSelect}
              dropdownOpen={dropdownOpen}
              onDropdownOpenChange={setDropdownOpen}
              onOpenFilePicker={openFilePicker}
              onOpenMcpSettings={() => {
                setDropdownOpen(false);
                void navigate({ to: "/settings/mcp" });
              }}
              instructions={instructions.map((instruction) => ({
                instructionId: instruction.instructionId,
                name: instruction.name,
                isDefault: instruction.isDefault,
                isBuiltin: instruction.isBuiltin,
              }))}
              selectedInstructionId={selectedInstruction?.instructionId}
              selectedInstructionName={
                selectedInstruction && !selectedInstruction.isDefault
                  ? selectedInstruction.name
                  : undefined
              }
              onInstructionChange={handleInstructionChange}
              instructionsReady={instructionsReady}
              canUploadFiles={canUploadFiles}
              isAnalysisWorkspaceEnabled={isAnalysisWorkspaceEnabled}
              isImageGenerationEnabled={isImageGenerationEnabled}
              isBashWorkspaceEnabled={isBashWorkspaceEnabled}
              isSearchEnabled={isSearchEnabled}
              imageGenerationModels={imageGenerationModels}
              selectedImageGenerationModelId={selectedImageGenerationModelId}
              onAnalysisWorkspaceEnabledChange={
                handleAnalysisWorkspaceEnabledChange
              }
              onImageGenerationEnabledChange={
                handleImageGenerationEnabledChange
              }
              onImageGenerationModelChange={handleImageGenerationModelChange}
              onBashWorkspaceEnabledChange={handleBashWorkspaceEnabledChange}
              onToggleSearch={() => handleSearchEnabledChange(!isSearchEnabled)}
              settingsReady={settingsReady}
              mcpServers={mcpServers.map((server) => ({
                mcpServerId: server.mcpServerId,
                name: server.name,
              }))}
              enabledMcpServerIds={enabledMcpServerIds}
              onToggleMcpServer={handleToggleMcpServer}
              isContentOverflowing={isContentOverflowing}
              isExpanded={isExpanded}
              onToggleExpand={toggleExpand}
              tokenCount={tokenCount}
              showTokenVisualization={showTokenVisualization}
              onTokenCountClick={handleTokenCountClick}
              selectedModel={selectedModel}
              onModelChange={(modelId) => {
                void handleModelChange(modelId);
              }}
              thinkingLevel={effectiveThinkingLevel}
              thinkingLevels={availableThinkingLevels}
              canConfigureReasoning={canConfigureReasoning}
              onThinkingLevelChange={handleThinkingLevelChange}
              input={input}
              hasUsableAttachments={hasUsableAttachments}
              isSubmitting={isSubmitting}
              hasUploadingFiles={hasUploadingFiles}
              draftReady={draftReady}
              isOutOfCredits={isOutOfCredits}
              onStopGeneration={onStopGeneration}
              onSubmit={() => void handleSubmit()}
              project={chatProjectId}
            />
          </div>
        </div>
      </div>

      <FilePreviewDialog
        file={previewFile}
        onClose={() => setPreviewFile(null)}
      />
      <AddCreditsDialog
        open={addCreditsOpen}
        onOpenChange={setAddCreditsOpen}
        billingState={billingState}
        triggerContext="out_of_credits"
      />
    </>
  );
}
