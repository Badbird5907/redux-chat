import { useCallback, useState } from "react";

export interface UseBranchStateReturn {
  // Current selections: parentId -> siblingIndex
  selections: Map<string | undefined, number>;

  // Update selection for a specific parent
  selectBranch: (parentId: string | undefined, siblingIndex: number) => void;

  // Reset selections to empty (will use defaults from tree)
  resetSelections: () => void;
}

export function useBranchState(): UseBranchStateReturn {
  const [selections, setSelections] = useState<Map<string | undefined, number>>(
    () => new Map(),
  );

  const selectBranch = useCallback(
    (parentId: string | undefined, siblingIndex: number) => {
      setSelections((prev) => {
        const next = new Map(prev);
        next.set(parentId, siblingIndex);
        return next;
      });
    },
    [],
  );

  const resetSelections = useCallback(() => {
    setSelections(new Map());
  }, []);

  return { selections, selectBranch, resetSelections };
}
