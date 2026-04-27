import type { RefObject } from "react";

import { cn } from "@redux/ui/lib/utils";

const TOKEN_COLORS = [
  "bg-red-200 dark:bg-red-900/30",
  "bg-blue-200 dark:bg-blue-900/30",
  "bg-green-200 dark:bg-green-900/30",
  "bg-yellow-200 dark:bg-yellow-900/30",
  "bg-purple-200 dark:bg-purple-900/30",
  "bg-pink-200 dark:bg-pink-900/30",
  "bg-indigo-200 dark:bg-indigo-900/30",
  "bg-orange-200 dark:bg-orange-900/30",
  "bg-teal-200 dark:bg-teal-900/30",
  "bg-cyan-200 dark:bg-cyan-900/30",
] as const;

interface TokenVisualizationProps {
  visualizationRef: RefObject<HTMLDivElement | null>;
  isExpanded: boolean;
  visualizationHeight: number | null;
  tokenizedText: string[];
  onClose: () => void;
}

export function TokenVisualization({
  visualizationRef,
  isExpanded,
  visualizationHeight,
  tokenizedText,
  onClose,
}: TokenVisualizationProps) {
  return (
    <div
      ref={visualizationRef}
      className={cn(
        "w-full cursor-pointer overflow-y-auto text-base leading-6 wrap-break-word whitespace-pre-wrap",
        isExpanded && "flex-1",
      )}
      style={
        isExpanded
          ? undefined
          : {
              height: visualizationHeight
                ? `${visualizationHeight}px`
                : "24px",
              maxHeight: `${24 * 10}px`,
              minHeight: "24px",
            }
      }
      onClick={onClose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          onClose();
        }
      }}
    >
      {tokenizedText.map((token, index) => {
        const colorClass = TOKEN_COLORS[index % TOKEN_COLORS.length];
        const hasNewline = token.includes("\n");

        if (hasNewline) {
          const parts = token.split("\n");
          return (
            <span key={index}>
              {parts.map((part, partIndex) => (
                <span key={`${index}-${partIndex}`}>
                  {part && (
                    <span
                      className={cn(
                        "inline-block rounded px-0.5",
                        colorClass,
                      )}
                    >
                      {part}
                    </span>
                  )}
                  {partIndex < parts.length - 1 && (
                    <>
                      <span
                        className={cn(
                          "inline-block rounded px-1 font-mono text-xs",
                          colorClass,
                          "opacity-70",
                        )}
                        title="Newline"
                      >
                        ↵
                      </span>
                      <br />
                    </>
                  )}
                </span>
              ))}
            </span>
          );
        }

        return (
          <span
            key={index}
            className={cn("inline-block rounded px-0.5", colorClass)}
          >
            {token}
          </span>
        );
      })}
    </div>
  );
}
