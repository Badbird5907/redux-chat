import type { ComponentProps } from "react";
import { StickToBottom } from "use-stick-to-bottom";

import { cn } from "@redux/ui/lib/utils";

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn(
      "flex w-full min-w-0 max-w-full flex-col gap-8 overflow-x-hidden p-4",
      className,
    )}
    {...props}
  />
);
