"use client";

import { memo } from "react";
import {
  CircleDollarSign,
  ClockIcon,
  WholeWord,
  ZapIcon,
} from "lucide-react";

import { getModelDisplayName } from "@redux/shared/models";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
import { cn } from "@redux/ui/lib/utils";

import type { MessageStats } from "./chat-types";

export const MessageStatsBar = memo(function MessageStatsBar({
  stats,
  actionsDisabled,
}: {
  stats: MessageStats | undefined;
  actionsDisabled: boolean;
}) {
  const usage = stats?.usage;
  const generationStats = stats?.generationStats;
  const model = stats?.model;
  const creditsConsumed = stats?.creditsConsumed;

  return (
    <div
      className={cn(
        "text-muted-foreground flex min-h-8 items-center gap-4 text-xs",
      )}
    >
      {model && (
        <span
          className={cn("flex items-center gap-1", actionsDisabled && "hidden")}
        >
          {getModelDisplayName(model)}
        </span>
      )}
      {generationStats && (
        <>
          <span className="flex items-center gap-1">
            <ZapIcon className="size-4" />
            {generationStats.tokensPerSecond.toFixed(2)} tok/sec
          </span>
          <span className="flex items-center gap-1">
            <ClockIcon className="size-4" />
            TTFT: {(generationStats.timeToFirstTokenMs / 1000).toFixed(2)} sec
          </span>

          {usage && (
            <span className="flex items-center gap-1">
              <WholeWord className="size-4" />
              {usage.responseTokens} tokens
            </span>
          )}
        </>
      )}
      {typeof creditsConsumed === "number" && (
        <Tooltip delay={150}>
          <TooltipTrigger
            render={
              <button
                type="button"
                className="flex items-center gap-1 rounded-sm"
                aria-label={`${creditsConsumed.toLocaleString()} credits consumed`}
              />
            }
          >
            <CircleDollarSign className="size-4" />
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6}>
            {creditsConsumed.toLocaleString()} credits consumed
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
});
