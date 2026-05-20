import { useState } from "react";
import { useMatch } from "@tanstack/react-router";
import { Share2 } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";

import { ThreadShareDialog } from "@/components/share/thread-share-dialog";

export function TopRightActions() {
  const chatMatch = useMatch({
    from: "/_app/chat/$id",
    shouldThrow: false,
  });
  const [shareOpen, setShareOpen] = useState(false);
  const threadId = chatMatch?.params.id;

  if (!threadId) {
    return null;
  }

  return (
    <div className="bg-card/80 absolute top-4 right-4 z-10 flex w-fit items-center justify-between gap-1 rounded-md p-1">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="Share thread"
              className="hover:bg-muted text-muted-foreground hover:text-foreground inline-flex size-8 items-center justify-center rounded-md transition-colors"
              onClick={() => setShareOpen(true)}
            />
          }
        >
          <Share2 className="size-4" />
        </TooltipTrigger>
        <TooltipContent side="left">Share thread</TooltipContent>
      </Tooltip>
      <ThreadShareDialog
        open={shareOpen}
        threadId={threadId}
        onOpenChange={setShareOpen}
      />
    </div>
  );
}
