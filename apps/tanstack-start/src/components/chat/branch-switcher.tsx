import { ChevronLeft, ChevronRight } from "lucide-react";

import type { BranchGroup } from "./chat-types";

export function BranchSwitcher({
  branchGroup,
  disabled,
  onSelectBranch,
}: {
  branchGroup: BranchGroup | undefined;
  disabled: boolean;
  onSelectBranch: (messageId: string) => void;
}) {
  if (!branchGroup) {
    return null;
  }

  const previous = branchGroup.siblings[branchGroup.currentIndex - 1];
  const next = branchGroup.siblings[branchGroup.currentIndex + 1];

  return (
    <div className="text-muted-foreground flex min-h-8 items-center gap-1 text-xs">
      <button
        className="hover:bg-muted rounded p-2 transition-colors disabled:opacity-50"
        title="Previous branch"
        type="button"
        disabled={disabled || !previous}
        onClick={() => previous && onSelectBranch(previous.id)}
      >
        <ChevronLeft className="size-4" />
      </button>
      <span
        className="inline-flex min-w-12 items-center justify-center gap-1 tabular-nums"
        title={`Branch ${branchGroup.currentIndex + 1} of ${branchGroup.siblings.length}`}
      >
        {branchGroup.currentIndex + 1}/{branchGroup.siblings.length}
      </span>
      <button
        className="hover:bg-muted rounded p-2 transition-colors disabled:opacity-50"
        title="Next branch"
        type="button"
        disabled={disabled || !next}
        onClick={() => next && onSelectBranch(next.id)}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
