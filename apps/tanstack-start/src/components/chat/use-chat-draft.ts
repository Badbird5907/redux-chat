"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";

import {
  deleteDraftAttachment,
  resolveAttachments,
} from "@/server/attachments";

export interface DraftAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  source?: "draft" | "retained";
  url?: string;
  uploading: boolean;
  expiresAt?: number;
  objectUrl?: string;
}

interface StoredDraft {
  version: number;
  text?: string;
  attachments?: {
    attachmentId: string;
    fileName: string;
    mimeType: string;
    size: number;
    expiresAt?: number;
    lastKnownUrl?: string;
  }[];
  updatedAt: number;
}

const STORAGE_VERSION = 2;
const DRAFT_UPDATED_EVENT = "redux-chat:draft-updated";

export function getChatDraftStorageKey(threadId?: string) {
  return threadId
    ? `redux-chat:draft:thread:${threadId}`
    : "redux-chat:draft:home";
}

export function setStoredChatDraft({
  threadId,
  text,
}: {
  threadId?: string;
  text: string;
}) {
  if (typeof window === "undefined") {
    return;
  }

  const scopeKey = getChatDraftStorageKey(threadId);
  const draft: StoredDraft = {
    version: STORAGE_VERSION,
    text,
    attachments: [],
    updatedAt: Date.now(),
  };

  window.localStorage.setItem(scopeKey, JSON.stringify(draft));
  window.dispatchEvent(
    new CustomEvent(DRAFT_UPDATED_EVENT, {
      detail: { scopeKey },
    }),
  );
}

function revokeObjectUrl(attachment: DraftAttachment) {
  if (attachment.objectUrl) {
    URL.revokeObjectURL(attachment.objectUrl);
  }
}

function revokeAttachmentRefUrls(attachmentsRef: RefObject<DraftAttachment[]>) {
  attachmentsRef.current.forEach(revokeObjectUrl);
}

function isAttachmentExpired(expiresAt: number | undefined, now = Date.now()) {
  return expiresAt !== undefined && expiresAt <= now;
}

function isDraftAttachment(value: unknown): value is DraftAttachment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attachment = value as Partial<DraftAttachment>;
  return (
    typeof attachment.attachmentId === "string" &&
    attachment.attachmentId.length > 0 &&
    typeof attachment.fileName === "string" &&
    typeof attachment.mimeType === "string" &&
    typeof attachment.size === "number" &&
    typeof attachment.uploading === "boolean"
  );
}

function sanitizeDraftAttachments(
  attachments: readonly unknown[],
): DraftAttachment[] {
  return attachments.filter(isDraftAttachment);
}

function isStoredAttachment(
  value: unknown,
): value is NonNullable<StoredDraft["attachments"]>[number] {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attachment = value as Partial<
    NonNullable<StoredDraft["attachments"]>[number]
  >;
  return (
    typeof attachment.attachmentId === "string" &&
    attachment.attachmentId.length > 0 &&
    typeof attachment.fileName === "string" &&
    typeof attachment.mimeType === "string" &&
    typeof attachment.size === "number"
  );
}

interface UseChatDraftOptions {
  threadId?: string;
  settingsReady: boolean;
  persistDraft?: boolean;
}

export function useChatDraft({
  threadId,
  settingsReady,
  persistDraft = true,
}: UseChatDraftOptions) {
  const resolveAttachmentsFn = useServerFn(resolveAttachments);
  const deleteDraftAttachmentFn = useServerFn(deleteDraftAttachment);
  const scopeKey = useMemo(() => getChatDraftStorageKey(threadId), [threadId]);

  const [text, setText] = useState("");
  const [attachments, setAttachmentsState] = useState<DraftAttachment[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [loadedScopeKey, setLoadedScopeKey] = useState<string | null>(null);
  const setTextRef = useRef(setText);
  const setIsReadyRef = useRef(setIsReady);
  const setLoadedScopeKeyRef = useRef(setLoadedScopeKey);
  setTextRef.current = setText;
  setIsReadyRef.current = setIsReady;
  setLoadedScopeKeyRef.current = setLoadedScopeKey;
  const previousAttachmentsRef = useRef<DraftAttachment[]>([]);

  const setAttachments = useCallback<
    Dispatch<SetStateAction<DraftAttachment[]>>
  >((value) => {
    setAttachmentsState((previous) => {
      const next =
        typeof value === "function"
          ? value(sanitizeDraftAttachments(previous))
          : value;

      return sanitizeDraftAttachments(next);
    });
  }, []);
  const setAttachmentsRef = useRef(setAttachments);
  setAttachmentsRef.current = setAttachments;

  useEffect(() => {
    const previousAttachments = previousAttachmentsRef.current;
    const currentAttachmentIds = new Set(
      attachments.map((attachment) => attachment.attachmentId),
    );

    previousAttachments.forEach((attachment) => {
      if (!currentAttachmentIds.has(attachment.attachmentId)) {
        revokeObjectUrl(attachment);
      }
    });

    previousAttachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      revokeAttachmentRefUrls(previousAttachmentsRef);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      if (!persistDraft) {
        setLoadedScopeKey(scopeKey);
        setIsReady(true);
        return;
      }

      setIsReady(false);
      setLoadedScopeKey(null);

      if (!settingsReady) {
        return;
      }

      if (typeof window === "undefined") {
        return;
      }

      const raw = window.localStorage.getItem(scopeKey);
      if (!raw) {
        if (!cancelled) {
          setText("");
          setAttachments([]);
          setLoadedScopeKey(scopeKey);
          setIsReady(true);
        }
        return;
      }

      try {
        const parsed = JSON.parse(raw) as StoredDraft;
        const rawSavedAttachments =
          parsed.version >= 1 && Array.isArray(parsed.attachments)
            ? parsed.attachments
            : [];
        const savedAttachments = rawSavedAttachments.filter(isStoredAttachment);

        if (savedAttachments.length !== rawSavedAttachments.length) {
          console.warn("Ignored invalid attachment entries in chat draft");
        }

        const currentSavedAttachments = savedAttachments.filter(
          (attachment) => !isAttachmentExpired(attachment.expiresAt),
        );

        if (currentSavedAttachments.length === 0) {
          if (!(parsed.text ?? "").trim()) {
            window.localStorage.removeItem(scopeKey);
          }
          if (!cancelled) {
            setText(parsed.text ?? "");
            setAttachments([]);
            setLoadedScopeKey(scopeKey);
            setIsReady(true);
          }
          return;
        }

        const resolvedAttachments = await resolveAttachmentsFn({
          data: {
            attachmentIds: currentSavedAttachments.map(
              (attachment) => attachment.attachmentId,
            ),
          },
        });

        const resolvedById = new Map(
          resolvedAttachments.map(
            (attachment) => [attachment.attachmentId, attachment] as const,
          ),
        );

        const hydratedAttachments = currentSavedAttachments.flatMap(
          (savedAttachment) => {
            const resolvedAttachment = resolvedById.get(
              savedAttachment.attachmentId,
            );
            if (!resolvedAttachment || resolvedAttachment.expired) {
              return [];
            }

            return [
              {
                attachmentId: resolvedAttachment.attachmentId,
                fileName: resolvedAttachment.fileName,
                mimeType: resolvedAttachment.mimeType,
                size: resolvedAttachment.size,
                url: resolvedAttachment.url,
                expiresAt: resolvedAttachment.expiresAt,
                uploading: false,
              } satisfies DraftAttachment,
            ];
          },
        );

        if (!cancelled) {
          setText(parsed.text ?? "");
          setAttachments(hydratedAttachments);
          setLoadedScopeKey(scopeKey);
          setIsReady(true);
        }
      } catch (error) {
        console.error("Failed to load chat draft", error);
        if (!cancelled) {
          setText("");
          setAttachments([]);
          setLoadedScopeKey(scopeKey);
          setIsReady(true);
        }
      }
    }

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, [
    persistDraft,
    resolveAttachmentsFn,
    scopeKey,
    setAttachments,
    settingsReady,
  ]);

  useEffect(() => {
    if (
      !persistDraft ||
      !isReady ||
      !settingsReady ||
      loadedScopeKey !== scopeKey ||
      typeof window === "undefined"
    ) {
      return;
    }

    const persistedAttachments = attachments.flatMap((attachment) => {
      if (attachment.uploading || isAttachmentExpired(attachment.expiresAt)) {
        return [];
      }

      return [
        {
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          expiresAt: attachment.expiresAt,
          lastKnownUrl: attachment.url,
        },
      ];
    });

    if (!text.trim() && persistedAttachments.length === 0) {
      window.localStorage.removeItem(scopeKey);
      return;
    }

    const draft: StoredDraft = {
      version: STORAGE_VERSION,
      text,
      attachments: persistedAttachments,
      updatedAt: Date.now(),
    };

    window.localStorage.setItem(scopeKey, JSON.stringify(draft));
  }, [
    attachments,
    isReady,
    loadedScopeKey,
    persistDraft,
    scopeKey,
    settingsReady,
    text,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleDraftUpdated: EventListener = (event) => {
      if (!persistDraft) {
        return;
      }

      const customEvent = event as CustomEvent<{ scopeKey?: string }>;
      if (customEvent.detail.scopeKey !== scopeKey) {
        return;
      }

      const raw = window.localStorage.getItem(scopeKey);
      if (!raw) {
        setTextRef.current("");
        setAttachmentsRef.current([]);
        setLoadedScopeKeyRef.current(scopeKey);
        setIsReadyRef.current(true);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as StoredDraft;
        setTextRef.current(parsed.text ?? "");
        setAttachmentsRef.current([]);
        setLoadedScopeKeyRef.current(scopeKey);
        setIsReadyRef.current(true);
      } catch (error) {
        console.error("Failed to sync chat draft", error);
      }
    };

    window.addEventListener(DRAFT_UPDATED_EVENT, handleDraftUpdated);

    return () => {
      window.removeEventListener(DRAFT_UPDATED_EVENT, handleDraftUpdated);
    };
  }, [persistDraft, scopeKey]);

  const appendAttachment = useCallback(
    (attachment: DraftAttachment) => {
      setAttachments((previous) => [...previous, attachment]);
    },
    [setAttachments],
  );

  const updateAttachment = useCallback(
    (
      attachmentId: string,
      updater: (attachment: DraftAttachment) => DraftAttachment,
    ) => {
      setAttachments((previous) =>
        previous.map((attachment) =>
          attachment.attachmentId === attachmentId
            ? updater(attachment)
            : attachment,
        ),
      );
    },
    [setAttachments],
  );

  const removeAttachment = useCallback(
    async (attachmentId: string) => {
      const attachment = attachments.find(
        (candidate) => candidate.attachmentId === attachmentId,
      );

      if (attachment?.source !== "retained") {
        await deleteDraftAttachmentFn({
          data: {
            attachmentId,
          },
        });
      }

      setAttachments((previous) =>
        previous.filter(
          (attachment) => attachment.attachmentId !== attachmentId,
        ),
      );
    },
    [attachments, deleteDraftAttachmentFn, setAttachments],
  );

  const clearDraft = useCallback(() => {
    setText("");
    setAttachments((previous) => {
      previous.forEach(revokeObjectUrl);
      return [];
    });
    setLoadedScopeKey(scopeKey);

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(scopeKey);
    }
  }, [scopeKey, setAttachments]);

  return {
    text,
    setText,
    attachments,
    isReady,
    appendAttachment,
    updateAttachment,
    removeAttachment,
    setAttachments,
    clearDraft,
  };
}
