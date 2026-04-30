import { Search } from "lucide-react";

import type { ModelSelectorState } from "./use-model-selector-state";
import { ModelFeatureFilters } from "./feature-filters";

type SearchBarProps = Pick<
  ModelSelectorState,
  | "searchInputRef"
  | "listboxId"
  | "open"
  | "query"
  | "setQuery"
  | "activeOptionId"
  | "modelFiltersPopoverOpen"
  | "setModelFiltersPopoverOpen"
  | "selectedFeatureFilters"
  | "setSelectedFeatureFilters"
  | "minKnowledgeCutoff"
  | "setMinKnowledgeCutoff"
  | "clearFilters"
  | "toggleFeatureFilter"
>;

export function ModelSelectorSearchBar(barProps: SearchBarProps) {
  const {
    searchInputRef,
    listboxId,
    open,
    query,
    setQuery,
    activeOptionId,
    modelFiltersPopoverOpen,
    setModelFiltersPopoverOpen,
    selectedFeatureFilters,
    minKnowledgeCutoff,
    setMinKnowledgeCutoff,
    clearFilters,
    toggleFeatureFilter,
  } = barProps;

  return (
    <div className="border-border/60 shrink-0 border-b p-2.5">
      <div className="flex items-center gap-2">
        <div className="focus-within:border-primary/70 focus-within:ring-primary/35 border-input bg-muted/50 flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 focus-within:ring-2">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <input
            ref={searchInputRef}
            type="search"
            role="combobox"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models..."
            className="placeholder:text-muted-foreground text-foreground min-w-0 flex-1 border-0 bg-transparent text-sm outline-none"
            autoComplete="off"
            autoCorrect="off"
          />
        </div>
        <ModelFeatureFilters
          filtersPopoverOpen={modelFiltersPopoverOpen}
          onFiltersPopoverOpenChange={setModelFiltersPopoverOpen}
          selectedIds={selectedFeatureFilters}
          onToggle={toggleFeatureFilter}
          minKnowledgeCutoff={minKnowledgeCutoff}
          onMinKnowledgeCutoffChange={setMinKnowledgeCutoff}
          onClear={clearFilters}
        />
      </div>
    </div>
  );
}
