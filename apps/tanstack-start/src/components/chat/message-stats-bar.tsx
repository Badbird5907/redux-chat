"use client";

import { memo } from "react";
import {
  ClockIcon,
  ImageIcon,
  InfoIcon,
  WholeWord,
  ZapIcon,
} from "lucide-react";

import { getModelDisplayName, isImageOutputModel } from "@redux/shared/models";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@redux/ui/components/popover";
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

function formatDuration(ms: number) {
  if (ms < 1000) {
    return `${Math.max(0, Math.round(ms))} ms`;
  }

  return `${(ms / 1000).toFixed(2)} sec`;
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
  const isImageModel = model ? isImageOutputModel(model) : false;
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
      {generationStats && isImageModel ? (
        <>
          <span className="hidden items-center gap-1 sm:flex">
            <ClockIcon className="size-4" />
            Generated in {formatDuration(generationStats.totalDurationMs)}
          </span>

          <span className="hidden items-center gap-1 sm:flex">
            <ImageIcon className="size-4" />1 image
          </span>

          <Popover>
            <PopoverTrigger className="text-muted-foreground flex items-center sm:hidden">
              <InfoIcon className="size-4" />
            </PopoverTrigger>
            <PopoverContent
              className="flex w-auto flex-col gap-2 p-3 text-xs"
              side="top"
              align="start"
            >
              <span className="flex items-center gap-1">
                <ClockIcon className="size-4" />
                Generated in {formatDuration(generationStats.totalDurationMs)}
              </span>
              <span className="flex items-center gap-1">
                <ImageIcon className="size-4" />1 image
              </span>
            </PopoverContent>
          </Popover>
        </>
      ) : generationStats ? (
        <>
          <span className="hidden items-center gap-1 sm:flex">
            <ZapIcon className="size-4" />
            {Math.round(generationStats.tokensPerSecond)} tok/sec
          </span>

          <span className="hidden items-center gap-1 sm:flex">
            <ClockIcon className="size-4" />
            TTFT: {(generationStats.timeToFirstTokenMs / 1000).toFixed(2)} sec
          </span>

          {usage && (
            <span className="hidden items-center gap-1 sm:flex">
              <WholeWord className="size-4" />
              {usage.responseTokens} tokens
            </span>
          )}

          <Popover>
            <PopoverTrigger className="text-muted-foreground flex items-center sm:hidden">
              <InfoIcon className="size-4" />
            </PopoverTrigger>
            <PopoverContent
              className="flex w-auto flex-col gap-2 p-3 text-xs"
              side="top"
              align="start"
            >
              <span className="flex items-center gap-1">
                <ZapIcon className="size-4" />
                {Math.round(generationStats.tokensPerSecond)} tok/sec
              </span>
              <span className="flex items-center gap-1">
                <ClockIcon className="size-4" />
                TTFT: {(generationStats.timeToFirstTokenMs / 1000).toFixed(
                  2,
                )}{" "}
                sec
              </span>
              {usage && (
                <span className="flex items-center gap-1">
                  <WholeWord className="size-4" />
                  {usage.responseTokens} tokens
                </span>
              )}
            </PopoverContent>
          </Popover>
        </>
      ) : null}
    </div>
  );
});
