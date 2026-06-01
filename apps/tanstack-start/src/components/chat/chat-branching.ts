import type { BranchGroup, ChatMessageWithThreadMetadata } from "./chat-types";

function messageOrderValue(message: ChatMessageWithThreadMetadata) {
  return message.createdAt ?? 0;
}

export function sortMessagesForBranching(
  messages: ChatMessageWithThreadMetadata[],
) {
  return messages.toSorted((left, right) => {
    const depthDelta = (left.depth ?? 0) - (right.depth ?? 0);
    if (depthDelta !== 0) {
      return depthDelta;
    }

    const siblingDelta = (left.siblingIndex ?? 0) - (right.siblingIndex ?? 0);
    if (siblingDelta !== 0) {
      return siblingDelta;
    }

    const timeDelta = messageOrderValue(left) - messageOrderValue(right);
    if (timeDelta !== 0) {
      return timeDelta;
    }

    return left.id.localeCompare(right.id);
  });
}

function getMessageMap(messages: ChatMessageWithThreadMetadata[]) {
  return new Map(messages.map((message) => [message.id, message] as const));
}

function getChildrenByParent(messages: ChatMessageWithThreadMetadata[]) {
  const childrenByParent = new Map<string, ChatMessageWithThreadMetadata[]>();

  for (const message of sortMessagesForBranching(messages)) {
    if (!message.parentId) {
      continue;
    }

    const existing = childrenByParent.get(message.parentId) ?? [];
    existing.push(message);
    childrenByParent.set(message.parentId, existing);
  }

  return childrenByParent;
}

export function getDeepestLeafForBranch(
  messages: ChatMessageWithThreadMetadata[],
  branchRootMessageId: string,
) {
  const messageMap = getMessageMap(messages);
  const root = messageMap.get(branchRootMessageId);
  if (!root) {
    return undefined;
  }

  const childrenByParent = getChildrenByParent(messages);
  let deepest = root;
  const stack = [...(childrenByParent.get(root.id) ?? [])];

  while (stack.length > 0) {
    const message = stack.pop();
    if (!message) {
      continue;
    }

    if (
      (message.depth ?? 0) > (deepest.depth ?? 0) ||
      ((message.depth ?? 0) === (deepest.depth ?? 0) &&
        messageOrderValue(message) > messageOrderValue(deepest))
    ) {
      deepest = message;
    }

    stack.push(...(childrenByParent.get(message.id) ?? []));
  }

  return deepest.id;
}

export function resolveSelectedLeaf(
  messages: ChatMessageWithThreadMetadata[],
  selectedLeafMessageId: string | undefined,
) {
  const messageMap = getMessageMap(messages);
  if (selectedLeafMessageId && messageMap.has(selectedLeafMessageId)) {
    return selectedLeafMessageId;
  }

  const sorted = sortMessagesForBranching(messages);
  const childrenByParent = getChildrenByParent(sorted);
  const leaves = sorted.filter((message) => !childrenByParent.has(message.id));
  const fallback = leaves.at(-1) ?? sorted.at(-1);

  return fallback?.id;
}

export function getVisibleBranchMessages(
  messages: ChatMessageWithThreadMetadata[],
  selectedLeafMessageId: string | undefined,
) {
  const messageMap = getMessageMap(messages);
  const resolvedLeaf = resolveSelectedLeaf(messages, selectedLeafMessageId);
  if (!resolvedLeaf) {
    return [];
  }

  const path: ChatMessageWithThreadMetadata[] = [];
  let current = messageMap.get(resolvedLeaf);

  while (current) {
    path.push(current);
    current = current.parentId ? messageMap.get(current.parentId) : undefined;
  }

  return path.reverse();
}

export function getSiblingBranchGroup(
  messages: ChatMessageWithThreadMetadata[],
  messageId: string,
): BranchGroup | undefined {
  const target = getMessageMap(messages).get(messageId);
  if (!target) {
    return undefined;
  }

  const siblings = sortMessagesForBranching(messages).filter(
    (message) =>
      message.role === target.role && message.parentId === target.parentId,
  );

  if (siblings.length <= 1) {
    return undefined;
  }

  const currentIndex = siblings.findIndex(
    (message) => message.id === messageId,
  );
  if (currentIndex < 0) {
    return undefined;
  }

  return {
    currentIndex,
    siblings,
  };
}
