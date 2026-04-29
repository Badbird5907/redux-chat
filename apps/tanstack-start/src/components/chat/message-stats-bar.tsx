"use client";

import { memo, useState } from "react";
import {
  CheckIcon,
  ClockIcon,
  CopyIcon,
  RefreshCwIcon,
  WholeWord,
  ZapIcon,
} from "lucide-react";

import { getChatModelConfig } from "@redux/types";
import { cn } from "@redux/ui/lib/utils";

import type { MessageStats } from "./chat-types";

export const MessageStatsBar = memo(function MessageStatsBar({
  stats,
  isVisible,
  content,
  actionsDisabled,
  onRegenerate,
}: {
  stats: MessageStats | undefined;
  isVisible: boolean;
  content?: string;
  actionsDisabled: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const usage = stats?.usage;
  const generationStats = stats?.generationStats;
  const model = stats?.model;

  return (
    <div
      className={cn(
        "text-muted-foreground mt-2 flex min-h-[32px] items-center gap-4 text-xs transition-opacity duration-200",
        isVisible ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="flex items-center gap-1">
        <button
          className={cn(
            "hover:bg-muted rounded p-2 transition-colors",
            actionsDisabled && "hidden",
          )}
          title="Copy"
          type="button"
          onClick={handleCopy}
        >
          {copied ? (
            <CheckIcon className="size-4" />
          ) : (
            <CopyIcon className="size-4" />
          )}
        </button>
        <button
          className={cn(
            "hover:bg-muted rounded p-2 transition-colors",
            actionsDisabled && "hidden",
          )}
          title="Regenerate"
          type="button"
          disabled={actionsDisabled}
          onClick={onRegenerate}
        >
          <RefreshCwIcon className="size-4" />
        </button>
      </div>

      {model && (
        <span className={cn("flex items-center gap-1", actionsDisabled && "hidden")}>
          {getChatModelConfig(model)?.name}
        </span>
      )}
      {generationStats && (
        <>
          <span className="flex items-center gap-1">
            <ZapIcon className="size-3.5" />
            {generationStats.tokensPerSecond.toFixed(2)} tok/sec
          </span>
          <span className="flex items-center gap-1">
            <ClockIcon className="size-3.5" />
            TTFT: {(generationStats.timeToFirstTokenMs / 1000).toFixed(2)} sec
          </span>

          {usage && (
            <span className="flex items-center gap-1">
              <WholeWord className="size-3.5" />
              {usage.responseTokens} tokens
            </span>
          )}
        </>
      )}
    </div>
  );
});
