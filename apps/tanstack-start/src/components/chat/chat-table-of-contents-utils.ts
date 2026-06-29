import type { UIMessage } from "ai";

import { getMessageText } from "./thread-export-utils";

export interface ChatTableOfContentsItem {
  id: string;
  role: "user" | "assistant" | "system";
  label: string;
}

export function buildChatTableOfContents(
  messages: ({ id: string; role: string } & Pick<UIMessage, "parts">)[],
): ChatTableOfContentsItem[] {
  return messages.map((message) => {
    const role =
      message.role === "user"
        ? "user"
        : message.role === "system"
          ? "system"
          : "assistant";
    const text = getMessageText(message).trim().replace(/\s+/g, " ");
    return {
      id: message.id,
      role,
      label: text || (role === "user" ? "Message" : "Response"),
    };
  });
}
