import type { ComponentProps } from "react";
import { StickToBottom } from "use-stick-to-bottom";

import { cn } from "@redux/ui/lib/utils";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn(
      "relative min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-hidden",
      className,
    )}
    initial="instant"
    resize="instant"
    role="log"
    {...props}
  />
);

export { ConversationContent } from "./conversation-content";
export { ConversationEmptyState } from "./conversation-empty-state";
export { ConversationScrollButton } from "./conversation-scroll-button";
export type { ConversationContentProps } from "./conversation-content";
export type { ConversationEmptyStateProps } from "./conversation-empty-state";
export type { ConversationScrollButtonProps } from "./conversation-scroll-button";
