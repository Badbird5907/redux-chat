import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@redux/ui/lib/utils";

interface BranchSelectorProps {
  current: number; // 0-indexed current branch
  total: number; // Total number of branches
  onPrev: () => void;
  onNext: () => void;
  visible: boolean; // Controlled by hover state
}

export function BranchSelector({
  current,
  total,
  onPrev,
  onNext,
  visible,
}: BranchSelectorProps) {
  // Don't render if there's only one branch
  if (total <= 1) return null;

  return (
    <div
      className={cn(
        "text-muted-foreground flex items-center gap-0.5 text-xs transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          onPrev();
        }}
        disabled={current === 0}
        className="hover:bg-muted rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        title="Previous branch"
      >
        <ChevronLeft className="size-3.5" />
      </button>
      <span className="min-w-[3ch] text-center tabular-nums">
        {current + 1}/{total}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onNext();
        }}
        disabled={current === total - 1}
        className="hover:bg-muted rounded p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-30"
        title="Next branch"
      >
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}
