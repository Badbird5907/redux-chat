"use client";

import type { DraftAttachment } from "@/components/chat/use-chat-draft";
import { useCallback, useEffect, useRef, useState } from "react";

export interface QueuedMessage {
  id: string;
  text: string;
  attachments: DraftAttachment[];
}

function newQueuedId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `q_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

/**
 * Copies draft attachments into a queued snapshot suitable for clearing the
 * composer: blob object URLs remain only on composer rows until clearDraft().
 */
export function snapshotAttachmentsForQueue(
  attachments: DraftAttachment[],
): DraftAttachment[] {
  return attachments.map((attachment) => ({
    ...attachment,
    objectUrl: undefined,
    source: attachment.source ?? "draft",
  }));
}

export function useMessageQueue({ threadId }: { threadId?: string }) {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const previousThreadRef = useRef(threadId);

  useEffect(() => {
    const previous = previousThreadRef.current;

    if (previous === threadId) {
      return;
    }

    const shouldClear =
      (previous !== undefined && threadId === undefined) ||
      (previous !== undefined &&
        threadId !== undefined &&
        previous !== threadId);

    previousThreadRef.current = threadId;

    if (shouldClear) {
      setQueue([]);
    }
  }, [threadId]);

  const enqueue = useCallback((message: Omit<QueuedMessage, "id">) => {
    const id = newQueuedId();
    setQueue((previous) => [...previous, { ...message, id }]);
    return id;
  }, []);

  const removeQueued = useCallback((id: string) => {
    setQueue((previous) => previous.filter((message) => message.id !== id));
  }, []);

  const updateQueued = useCallback(
    (
      id: string,
      patch: Partial<Pick<QueuedMessage, "text" | "attachments">>,
    ) => {
      setQueue((previous) =>
        previous.map((message) =>
          message.id === id ? { ...message, ...patch } : message,
        ),
      );
    },
    [],
  );

  const moveQueuedToFront = useCallback((id: string) => {
    setQueue((previous) => {
      const index = previous.findIndex((message) => message.id === id);
      if (index <= 0) {
        return previous;
      }

      const next = [...previous];
      const moved = next.splice(index, 1)[0];
      if (!moved) {
        return previous;
      }

      return [moved, ...next];
    });
  }, []);

  const consumeHead = useCallback(() => {
    let head: QueuedMessage | undefined;

    setQueue((previous) => {
      if (previous.length === 0) {
        return previous;
      }

      head = previous[0];
      return previous.slice(1);
    });

    return head;
  }, []);

  const takeQueued = useCallback((id: string) => {
    let taken: QueuedMessage | undefined;

    setQueue((previous) => {
      const index = previous.findIndex((message) => message.id === id);
      if (index < 0) {
        return previous;
      }

      taken = previous[index];

      return previous.filter((_, candidateIndex) => candidateIndex !== index);
    });

    return taken;
  }, []);

  const prependQueued = useCallback((message: QueuedMessage) => {
    setQueue((previous) => [message, ...previous]);
  }, []);

  return {
    queue,
    setQueue,
    enqueue,
    removeQueued,
    updateQueued,
    moveQueuedToFront,
    consumeHead,
    takeQueued,
    prependQueued,
  };
}
