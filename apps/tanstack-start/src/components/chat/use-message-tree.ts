import { useMemo } from "react";

export interface TreeMessage {
  id: string;
  messageId: string;
  parentId: string | undefined;
  siblingIndex: number;
  depth: number;
  role: "user" | "assistant" | "system";
  parts: unknown[];
  status: "generating" | "completed" | "failed";
  // Additional fields from Convex
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
}

export interface MessageTreeReturn {
  // Messages grouped by parentId
  messagesByParent: Map<string | undefined, TreeMessage[]>;

  // Get the visible message path given branch selections
  // selections: Map<parentId, selectedSiblingIndex>
  getVisiblePath: (
    selections: Map<string | undefined, number>,
  ) => TreeMessage[];

  // Get all siblings for a given parentId
  getSiblings: (parentId: string | undefined) => TreeMessage[];

  // Get default branch selections (latest branch at each level)
  getDefaultSelections: () => Map<string | undefined, number>;

  // Get a message by its ID
  getMessageById: (messageId: string) => TreeMessage | undefined;
}

export function useMessageTree(
  messages: TreeMessage[] | undefined,
): MessageTreeReturn {
  return useMemo(() => {
    const messageList = messages ?? [];

    // Create a map for quick ID lookup
    const messagesById = new Map<string, TreeMessage>();
    messageList.forEach((m) => {
      messagesById.set(m.messageId, m);
    });

    // Group messages by parentId and sort by siblingIndex
    const byParent = new Map<string | undefined, TreeMessage[]>();

    messageList.forEach((m) => {
      const parentId = m.parentId;
      const siblings = byParent.get(parentId) ?? [];
      siblings.push(m);
      byParent.set(parentId, siblings);
    });

    // Sort siblings by siblingIndex
    byParent.forEach((siblings) => {
      siblings.sort((a, b) => a.siblingIndex - b.siblingIndex);
    });

    const getSiblings = (parentId: string | undefined): TreeMessage[] => {
      return byParent.get(parentId) ?? [];
    };

    const getVisiblePath = (
      selections: Map<string | undefined, number>,
    ): TreeMessage[] => {
      const path: TreeMessage[] = [];
      let parentId: string | undefined = undefined;

      while (true) {
        const siblings = byParent.get(parentId);
        if (!siblings?.length) break;

        // Get selected index, default to latest (last) sibling
        const selectedIndex: number =
          selections.get(parentId) ?? siblings.length - 1;
        const selected: TreeMessage | undefined =
          siblings[Math.min(selectedIndex, siblings.length - 1)];
        if (!selected) break;

        path.push(selected);
        parentId = selected.messageId;
      }

      return path;
    };

    const getDefaultSelections = (): Map<string | undefined, number> => {
      const selections = new Map<string | undefined, number>();

      // Walk through and select latest sibling at each level
      let parentId: string | undefined = undefined;

      while (true) {
        const siblings = byParent.get(parentId);
        if (!siblings?.length) break;

        // Select latest sibling
        const latestIndex: number = siblings.length - 1;
        selections.set(parentId, latestIndex);

        const selected: TreeMessage | undefined = siblings[latestIndex];
        if (!selected) break;

        parentId = selected.messageId;
      }

      return selections;
    };

    const getMessageById = (messageId: string): TreeMessage | undefined => {
      return messagesById.get(messageId);
    };

    return {
      messagesByParent: byParent,
      getVisiblePath,
      getSiblings,
      getDefaultSelections,
      getMessageById,
    };
  }, [messages]);
}
