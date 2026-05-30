"use client";

import type { DraftAttachment } from "@/components/chat/use-chat-draft";
import { useCallback, useRef, useState } from "react";

export interface QueuedMessage {
  id: string;
  text: string;
  attachments: DraftAttachment[];
}

interface QueueState {
  threadId: string | undefined;
  messages: QueuedMessage[];
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
  const [queueState, setQueueState] = useState<QueueState>({
    threadId,
    messages: [],
  });
  const queue =
    queueState.threadId !== undefined && queueState.threadId !== threadId
      ? []
      : queueState.messages;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  const replaceQueue = useCallback(
    (next: QueuedMessage[]) => {
      queueRef.current = next;
      setQueueState({ threadId, messages: next });
    },
    [threadId],
  );

  const enqueue = useCallback(
    (message: Omit<QueuedMessage, "id">) => {
      const id = newQueuedId();
      replaceQueue([...queueRef.current, { ...message, id }]);
      return id;
    },
    [replaceQueue],
  );

  const removeQueued = useCallback(
    (id: string) => {
      replaceQueue(queueRef.current.filter((message) => message.id !== id));
    },
    [replaceQueue],
  );

  const updateQueued = useCallback(
    (
      id: string,
      patch: Partial<Pick<QueuedMessage, "text" | "attachments">>,
    ) => {
      replaceQueue(
        queueRef.current.map((message) =>
          message.id === id ? { ...message, ...patch } : message,
        ),
      );
    },
    [replaceQueue],
  );

  const moveQueuedToFront = useCallback(
    (id: string) => {
      const index = queueRef.current.findIndex((message) => message.id === id);
      if (index <= 0) {
        return;
      }

      const next = [...queueRef.current];
      const moved = next.splice(index, 1)[0];
      if (!moved) {
        return;
      }

      replaceQueue([moved, ...next]);
    },
    [replaceQueue],
  );

  const consumeHead = useCallback(() => {
    const head = queueRef.current[0];
    if (head) {
      replaceQueue(queueRef.current.slice(1));
    }
    return head;
  }, [replaceQueue]);

  const takeQueued = useCallback(
    (id: string) => {
      const index = queueRef.current.findIndex((message) => message.id === id);
      const taken = queueRef.current[index];
      if (index >= 0) {
        replaceQueue(
          queueRef.current.filter(
            (_, candidateIndex) => candidateIndex !== index,
          ),
        );
      }
      return taken;
    },
    [replaceQueue],
  );

  const prependQueued = useCallback(
    (message: QueuedMessage) => {
      replaceQueue([message, ...queueRef.current]);
    },
    [replaceQueue],
  );

  return {
    queue,
    replaceQueue,
    enqueue,
    removeQueued,
    updateQueued,
    moveQueuedToFront,
    consumeHead,
    takeQueued,
    prependQueued,
  };
}
