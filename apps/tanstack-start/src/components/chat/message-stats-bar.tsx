"use client";

import { memo } from "react";
import { ClockIcon, WholeWord, ZapIcon } from "lucide-react";

import { getModelDisplayName } from "@redux/shared/models";
import { cn } from "@redux/ui/lib/utils";

import type { MessageStats } from "./chat-types";
import {
  THINKING_LEVEL_ICONS,
  THINKING_LEVEL_LABELS,
} from "./thinking-level-display";

function getReasoningLevelDisplay(level: MessageStats["thinkingLevel"]) {
  switch (level) {
    case "instant":
      return {
        Icon: THINKING_LEVEL_ICONS.instant,
        label: THINKING_LEVEL_LABELS.instant,
      };
    case "low":
      return {
        Icon: THINKING_LEVEL_ICONS.low,
        label: THINKING_LEVEL_LABELS.low,
      };
    case "medium":
      return {
        Icon: THINKING_LEVEL_ICONS.medium,
        label: THINKING_LEVEL_LABELS.medium,
      };
    case "high":
      return {
        Icon: THINKING_LEVEL_ICONS.high,
        label: THINKING_LEVEL_LABELS.high,
      };
    default:
      return null;
  }
}

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
  const reasoning = getReasoningLevelDisplay(stats?.thinkingLevel);
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
      {reasoning && (
        <span
          className={cn("flex items-center gap-1", actionsDisabled && "hidden")}
        >
          <reasoning.Icon className="size-4" />
          {reasoning.label}
        </span>
      )}
      {generationStats && (
        <>
          <span className="flex items-center gap-1">
            <ZapIcon className="size-4" />
            {Math.round(generationStats.tokensPerSecond)} tok/sec
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
