import type { UIMessage } from "ai";

import { getMessageText } from "./thread-export-utils";

export interface ChatTableOfContentsItem {
  id: string;
  label: string;
}

export function buildChatTableOfContents(
  messages: ({ id: string; role: string } & Pick<UIMessage, "parts">)[],
): ChatTableOfContentsItem[] {
  return messages
    .filter((message) => message.role === "user")
    .map((message) => {
      const text = getMessageText(message).trim().replace(/\s+/g, " ");
      return {
        id: message.id,
        label: text || "Message",
      };
    });
}
