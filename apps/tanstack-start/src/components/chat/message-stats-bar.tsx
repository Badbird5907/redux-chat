"use client";

import { memo } from "react";
import { ClockIcon, WholeWord, ZapIcon } from "lucide-react";

import { getModelDisplayName } from "@redux/shared/models";
import { cn } from "@redux/ui/lib/utils";

import type { MessageStats } from "./chat-types";

export const MessageStatsBar = memo(function MessageStatsBar({
  stats,
  isVisible,
  actionsDisabled,
}: {
  stats: MessageStats | undefined;
  isVisible: boolean;
  actionsDisabled: boolean;
}) {
  const usage = stats?.usage;
  const generationStats = stats?.generationStats;
  const model = stats?.model;

  return (
    <div
      className={cn(
        "text-muted-foreground flex min-h-8 items-center gap-4 text-xs transition-opacity duration-200",
        isVisible ? "opacity-100" : "opacity-0",
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
    </div>
  );
});
