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
    className={cn("flex flex-col gap-8 p-4", className)}
    {...props}
  />
);
