"use client";

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
  url?: string;
  uploading: boolean;
  expiresAt?: number;
  objectUrl?: string;
}

interface StoredDraft {
  version: 1;
  text: string;
  attachments: Array<{
    attachmentId: string;
    fileName: string;
    mimeType: string;
    size: number;
    lastKnownUrl?: string;
  }>;
  updatedAt: number;
}

const STORAGE_VERSION = 1;

function getStorageKey(threadId?: string) {
  return threadId ? `redux-chat:draft:thread:${threadId}` : "redux-chat:draft:home";
}

function revokeObjectUrl(attachment: DraftAttachment) {
  if (attachment.objectUrl) {
    URL.revokeObjectURL(attachment.objectUrl);
  }
}

export function useChatDraft(threadId?: string) {
  const resolveAttachmentsFn = useServerFn(resolveAttachments);
  const deleteDraftAttachmentFn = useServerFn(deleteDraftAttachment);
  const scopeKey = useMemo(() => getStorageKey(threadId), [threadId]);

  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [isReady, setIsReady] = useState(false);
  const previousAttachmentsRef = useRef<DraftAttachment[]>([]);

  useEffect(() => {
    const previousAttachments = previousAttachmentsRef.current;
    const currentAttachmentIds = new Set(attachments.map((attachment) => attachment.attachmentId));

    previousAttachments.forEach((attachment) => {
      if (!currentAttachmentIds.has(attachment.attachmentId)) {
        revokeObjectUrl(attachment);
      }
    });

    previousAttachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      previousAttachmentsRef.current.forEach(revokeObjectUrl);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadDraft() {
      setIsReady(false);

      if (typeof window === "undefined") {
        return;
      }

      const raw = window.localStorage.getItem(scopeKey);
      if (!raw) {
        if (!cancelled) {
          setText("");
          setAttachments([]);
          setIsReady(true);
        }
        return;
      }

      try {
        const parsed = JSON.parse(raw) as StoredDraft;
        const savedAttachments = parsed.version === STORAGE_VERSION ? parsed.attachments : [];

        if (savedAttachments.length === 0) {
          if (!cancelled) {
            setText(parsed.text ?? "");
            setAttachments([]);
            setIsReady(true);
          }
          return;
        }

        const resolvedAttachments = await resolveAttachmentsFn({
          data: {
            attachmentIds: savedAttachments.map((attachment) => attachment.attachmentId),
          },
        });

        const resolvedById = new Map(
          resolvedAttachments.map((attachment) => [attachment.attachmentId, attachment] as const),
        );

        const hydratedAttachments = savedAttachments.flatMap((savedAttachment) => {
          const resolvedAttachment = resolvedById.get(savedAttachment.attachmentId);
          if (!resolvedAttachment) {
            return [];
          }

          return [
            {
              attachmentId: resolvedAttachment.attachmentId,
              fileName: resolvedAttachment.fileName,
              mimeType: resolvedAttachment.mimeType,
              size: resolvedAttachment.size,
              url: resolvedAttachment.url ?? savedAttachment.lastKnownUrl,
              expiresAt: resolvedAttachment.expiresAt,
              uploading: false,
            } satisfies DraftAttachment,
          ];
        });

        if (!cancelled) {
          setText(parsed.text ?? "");
          setAttachments(hydratedAttachments);
          setIsReady(true);
        }
      } catch (error) {
        console.error("Failed to load chat draft", error);
        if (!cancelled) {
          setText("");
          setAttachments([]);
          setIsReady(true);
        }
      }
    }

    void loadDraft();

    return () => {
      cancelled = true;
    };
  }, [resolveAttachmentsFn, scopeKey]);

  useEffect(() => {
    if (!isReady || typeof window === "undefined") {
      return;
    }

    const draft: StoredDraft = {
      version: STORAGE_VERSION,
      text,
      attachments: attachments
        .filter((attachment) => !attachment.uploading)
        .map((attachment) => ({
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          lastKnownUrl: attachment.url,
        })),
      updatedAt: Date.now(),
    };

    window.localStorage.setItem(scopeKey, JSON.stringify(draft));
  }, [attachments, isReady, scopeKey, text]);

  const appendAttachment = useCallback((attachment: DraftAttachment) => {
    setAttachments((previous) => [...previous, attachment]);
  }, []);

  const updateAttachment = useCallback(
    (attachmentId: string, updater: (attachment: DraftAttachment) => DraftAttachment) => {
      setAttachments((previous) =>
        previous.map((attachment) =>
          attachment.attachmentId === attachmentId ? updater(attachment) : attachment,
        ),
      );
    },
    [],
  );

  const removeAttachment = useCallback(
    async (attachmentId: string) => {
      await deleteDraftAttachmentFn({
        data: {
          attachmentId,
        },
      });

      setAttachments((previous) =>
        previous.filter((attachment) => attachment.attachmentId !== attachmentId),
      );
    },
    [deleteDraftAttachmentFn],
  );

  const clearDraft = useCallback(() => {
    setText("");
    setAttachments((previous) => {
      previous.forEach(revokeObjectUrl);
      return [];
    });

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(scopeKey);
    }
  }, [scopeKey]);

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
