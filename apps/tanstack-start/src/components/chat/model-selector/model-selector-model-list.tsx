import type { DragEvent } from "react";
import { Sparkles, Star } from "lucide-react";
import { LayoutGroup, m } from "motion/react";

import type { PlanTier } from "@redux/shared";
import type { ChatModelConfig } from "@redux/shared/models";
import {
  getModelDisplayName,
  isModelNewlyReleased,
  NEW_MODEL_RECENCY_DAYS,
} from "@redux/shared/models";
import { Button } from "@redux/ui/components/button";
import { cn } from "@redux/ui/lib/utils";

import type { ModelSelectorState } from "./use-model-selector-state";
import { useBillingState } from "@/components/chat/use-billing-state";
import { Capabilities } from "./capabilities";
import { panelSpring } from "./constants";
import { ModelRowSubtitle } from "./model-row-subtitle";

const listboxRole = "listbox" as const;

type ModelListProps = Pick<
  ModelSelectorState,
  | "listboxRef"
  | "listboxId"
  | "optionIdPrefix"
  | "optionRefs"
  | "favoritesLayoutGroupId"
  | "filteredModels"
  | "selectedModel"
  | "favoriteIds"
  | "validFavoriteModelIds"
  | "isSearchActive"
  | "hasActiveModelFilters"
  | "activeSidebar"
  | "navColumn"
  | "effectiveListNavIndex"
  | "canReorderFavorites"
  | "favoriteDragId"
  | "favoriteDropInsertIndex"
  | "isFavoritesListView"
  | "pickModelAt"
  | "onFavoriteDragStart"
  | "onFavoriteDragEnd"
  | "handleFavoriteRowDragOver"
  | "handleFavoriteRowDrop"
  | "toggleFavorite"
  | "setListNavIndex"
  | "setNavColumn"
>;

export function ModelSelectorModelList(props: ModelListProps) {
  const {
    filteredModels,
    validFavoriteModelIds,
    isSearchActive,
    hasActiveModelFilters,
    activeSidebar,
    listboxRef,
    listboxId,
    favoritesLayoutGroupId,
  } = props;
  const { billingState } = useBillingState();
  const currentTier: PlanTier = billingState?.tier ?? "free";

  const emptyMessage =
    activeSidebar === "favorites" &&
    validFavoriteModelIds.length === 0 &&
    !isSearchActive &&
    !hasActiveModelFilters
      ? "No favorites yet. Star a model to add it."
      : isSearchActive || hasActiveModelFilters
        ? "No models match your filters or search."
        : "No models match your search.";

  return (
    <m.div
      layout="position"
      transition={panelSpring}
      className="min-h-0 min-w-0 flex-1"
    >
      <div
        ref={listboxRef}
        id={listboxId}
        role={listboxRole}
        aria-label="Models"
        className="h-full min-h-0 overflow-y-auto overscroll-contain"
      >
        {filteredModels.length === 0 ? (
          <m.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={panelSpring}
            className="text-muted-foreground px-3 py-8 text-center text-sm"
          >
            {emptyMessage}
          </m.p>
        ) : (
          <LayoutGroup id={favoritesLayoutGroupId}>
            {filteredModels.map((model, rowIndex) => (
              <ModelRow
                key={model.id}
                model={model}
                rowIndex={rowIndex}
                tier={currentTier}
                listProps={props}
              />
            ))}
          </LayoutGroup>
        )}
      </div>
    </m.div>
  );
}

function ModelRow({
  model,
  rowIndex,
  tier,
  listProps,
}: {
  model: ChatModelConfig;
  rowIndex: number;
  tier: PlanTier;
  listProps: ModelListProps;
}) {
  const selected = model.id === listProps.selectedModel;
  const favorited = listProps.favoriteIds.has(model.id);
  const showDropLineBefore =
    listProps.canReorderFavorites &&
    listProps.favoriteDragId !== null &&
    listProps.favoriteDropInsertIndex === rowIndex;
  const showDropLineAfter =
    listProps.canReorderFavorites &&
    listProps.favoriteDragId !== null &&
    listProps.favoriteDropInsertIndex === rowIndex + 1;

  const listKeyboardActive =
    listProps.effectiveListNavIndex === rowIndex &&
    (listProps.isSearchActive || listProps.navColumn === "list");

  return (
    <m.div
      id={`${listProps.optionIdPrefix}-opt-${model.id}`}
      ref={(el) => {
        if (el) listProps.optionRefs.current?.set(model.id, el);
        else listProps.optionRefs.current?.delete(model.id);
      }}
      layout={listProps.isFavoritesListView}
      initial={false}
      transition={panelSpring}
      role="option"
      aria-selected={selected}
      aria-grabbed={
        listProps.canReorderFavorites && listProps.favoriteDragId === model.id
          ? true
          : undefined
      }
      tabIndex={-1}
      draggable={listProps.canReorderFavorites}
      onClick={() => {
        listProps.setListNavIndex(rowIndex);
        listProps.setNavColumn("list");
        listProps.pickModelAt(rowIndex);
      }}
      onDragStart={
        listProps.canReorderFavorites
          ? (e) =>
              listProps.onFavoriteDragStart(
                model.id,
                e as unknown as DragEvent<HTMLDivElement>,
              )
          : undefined
      }
      onDragEnd={
        listProps.canReorderFavorites ? listProps.onFavoriteDragEnd : undefined
      }
      onDragOver={
        listProps.canReorderFavorites
          ? (e) => listProps.handleFavoriteRowDragOver(rowIndex, e)
          : undefined
      }
      onDrop={
        listProps.canReorderFavorites
          ? (e) => listProps.handleFavoriteRowDrop(rowIndex, e)
          : undefined
      }
      className={cn(
        "hover:bg-muted/80 flex w-full cursor-pointer items-start gap-2 px-3 py-2.5 text-left transition-colors outline-none",
        selected && "bg-muted/60",
        listKeyboardActive && "ring-primary/35 ring-2 ring-inset",
        listProps.canReorderFavorites &&
          listProps.favoriteDragId === model.id &&
          "opacity-60",
        (showDropLineBefore || showDropLineAfter) &&
          "transition-shadow duration-200 ease-out",
        showDropLineBefore &&
          "shadow-[0_-2px_0_0_#3b82f6] dark:shadow-[0_-2px_0_0_#60a5fa]",
        showDropLineAfter &&
          "shadow-[0_2px_0_0_#3b82f6] dark:shadow-[0_2px_0_0_#60a5fa]",
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          "text-muted-foreground hover:bg-muted mt-0.5 size-7 shrink-0 hover:text-amber-600 dark:hover:text-amber-400",
          favorited &&
            "hover:bg-muted text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300",
        )}
        onClick={(e) => void listProps.toggleFavorite(model.id, e)}
        aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      >
        <Star className={cn("size-4", favorited && "fill-current")} />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="text-foreground flex min-w-0 flex-wrap items-center gap-1.5 text-sm leading-tight font-semibold">
          <span className="min-w-0 truncate">
            {getModelDisplayName(model.id)}
          </span>
          {isModelNewlyReleased(model.releasedAt) ? (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-emerald-500/12 px-1.5 py-px text-[10px] font-bold tracking-wide text-emerald-700 uppercase shadow-[0_0_12px_-4px_var(--color-emerald-500,oklch(0.696_0.17_162.48))] dark:text-emerald-400"
              title={`Released within the last ${NEW_MODEL_RECENCY_DAYS} days`}
            >
              <Sparkles className="size-2.5" aria-hidden />
              New
            </span>
          ) : null}
        </div>
        <ModelRowSubtitle model={model} tier={tier} />
      </div>
      <div className="shrink-0 self-start">
        <Capabilities model={model} />
      </div>
    </m.div>
  );
}
