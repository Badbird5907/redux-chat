import type { ModelSelectorRequestDetail } from "@/components/chat/open-model-selector";
import type { DragEvent, MouseEvent } from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { usePostHog } from "posthog-js/react";
import { toast } from "sonner";

import type { ChatModelConfig } from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";
import { useIsMobile } from "@redux/ui/hooks/use-mobile";
import {
  CHAT_MODELS,
  compareChatModelsByReleaseDateNewestFirst,
  PROVIDERS,
} from "@redux/shared/models";

import type {
  MinKnowledgeCutoff,
  ModelFeatureFilterId,
} from "./feature-filter-utils";
import { requestFocusComposer } from "@/components/chat/focus-composer";
import { OPEN_MODEL_SELECTOR_EVENT } from "@/components/chat/open-model-selector";
import { useQuery } from "@/lib/hooks/convex";
import {
  modelMatchesFeatureFilters,
  modelMatchesMinKnowledgeCutoff,
} from "./feature-filter-utils";

type ModelSelectorNavColumn = "search" | "sidebar" | "list";

export function useModelSelectorState({
  selectedModel,
  onModelChange,
}: {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}) {
  const posthog = usePostHog();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedFeatureFilters, setSelectedFeatureFilters] = useState<
    ModelFeatureFilterId[]
  >([]);
  const [minKnowledgeCutoff, setMinKnowledgeCutoff] =
    useState<MinKnowledgeCutoff | null>(null);
  const [modelFiltersPopoverOpen, setModelFiltersPopoverOpen] = useState(false);

  const hasActiveModelFilters =
    selectedFeatureFilters.length > 0 || minKnowledgeCutoff != null;
  const [favoriteDragId, setFavoriteDragId] = useState<string | null>(null);
  const [favoriteDropInsertIndex, setFavoriteDropInsertIndex] = useState<
    number | null
  >(null);
  const favoriteDragActiveRef = useRef(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<string, HTMLDivElement> | null>(null);
  optionRefs.current ??= new Map();
  const listboxId = useId();
  const optionIdPrefix = useId();
  const favoritesLayoutGroupId = useId();
  const [navColumn, setNavColumn] = useState<ModelSelectorNavColumn>("search");
  const [listNavIndex, setListNavIndex] = useState(-1);
  const [sidebarNavIndex, setSidebarNavIndex] = useState(0);
  const [activeSidebar, setActiveSidebar] = useState<string>("favorites");
  const favoriteModelIdsResult = useQuery(
    api.functions.modelFavorites.list,
    {},
    { default: [] },
  );
  const favoriteModelIds = useMemo(
    () => favoriteModelIdsResult ?? [],
    [favoriteModelIdsResult],
  );
  const setFavorite = useMutation(api.functions.modelFavorites.setFavorite);
  const reorderFavorites = useMutation(api.functions.modelFavorites.reorder);
  const replaceAllFavorites = useMutation(
    api.functions.modelFavorites.replaceAll,
  );
  const getOrCreateDefaultFavorites = useMutation(
    api.functions.modelFavorites.getOrCreateDefaults,
  );

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;

    void getOrCreateDefaultFavorites({}).catch((error: unknown) => {
      console.error("Failed to initialize favorite models", error);
    });
  }, [getOrCreateDefaultFavorites, isAuthenticated, isAuthLoading]);

  const favoriteIds = useMemo(
    () => new Set(favoriteModelIds),
    [favoriteModelIds],
  );

  const modelById = useMemo(
    () =>
      new Map<string, ChatModelConfig>(
        CHAT_MODELS.map((model) => [model.id, model]),
      ),
    [],
  );
  const validFavoriteModelIds = useMemo(
    () => favoriteModelIds.filter((modelId) => modelById.has(modelId)),
    [favoriteModelIds, modelById],
  );
  const hasStaleFavorites =
    validFavoriteModelIds.length !== favoriteModelIds.length;
  const favoriteReconciliationSignature = validFavoriteModelIds.join("\u0000");
  const lastFavoriteReconciliationRef = useRef<string | null>(null);

  const sidebarProviders = useMemo(() => {
    const makers = new Set(CHAT_MODELS.map((m) => m.maker));
    return PROVIDERS.filter((p) => makers.has(p.slug));
  }, []);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !hasStaleFavorites) {
      return;
    }

    if (
      lastFavoriteReconciliationRef.current === favoriteReconciliationSignature
    ) {
      return;
    }

    lastFavoriteReconciliationRef.current = favoriteReconciliationSignature;
    void replaceAllFavorites({ modelIds: validFavoriteModelIds }).catch(
      (error: unknown) => {
        lastFavoriteReconciliationRef.current = null;
        console.error("Failed to reconcile favorite models", error);
      },
    );
  }, [
    favoriteReconciliationSignature,
    hasStaleFavorites,
    isAuthenticated,
    isAuthLoading,
    replaceAllFavorites,
    validFavoriteModelIds,
  ]);

  const toggleFavorite = useCallback(
    async (modelId: string, e?: MouseEvent) => {
      e?.stopPropagation();
      e?.preventDefault();

      try {
        await setFavorite({
          modelId,
          favorited: !favoriteIds.has(modelId),
        });
      } catch (error) {
        toast.error("Failed to update favorite models");
        console.error("Failed to update favorite models", error);
      }
    },
    [favoriteIds, setFavorite],
  );

  const reorderFavoriteToInsertIndex = useCallback(
    async (draggedId: string, insertIndex: number) => {
      const from = validFavoriteModelIds.indexOf(draggedId);
      if (from === -1) return;

      const next = [...validFavoriteModelIds];
      const removed = next.splice(from, 1)[0];
      if (removed === undefined) return;

      const len = validFavoriteModelIds.length;
      let to = Math.max(0, Math.min(insertIndex, len));
      if (from < to) to--;
      to = Math.max(0, Math.min(to, next.length));
      next.splice(to, 0, removed);

      try {
        await reorderFavorites({ modelIds: next });
      } catch (error) {
        toast.error("Failed to reorder favorite models");
        console.error("Failed to reorder favorite models", error);
      }
    },
    [reorderFavorites, validFavoriteModelIds],
  );

  const onFavoriteDragStart = useCallback((modelId: string, e: DragEvent) => {
    e.stopPropagation();
    favoriteDragActiveRef.current = true;
    setFavoriteDropInsertIndex(null);
    setFavoriteDragId(modelId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", modelId);
  }, []);

  const onFavoriteDragEnd = useCallback(() => {
    favoriteDragActiveRef.current = false;
    setFavoriteDragId(null);
    setFavoriteDropInsertIndex(null);
  }, []);

  useEffect(() => {
    if (favoriteDragId === null) return;
    const previous = document.body.style.cursor;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = previous;
    };
  }, [favoriteDragId]);

  const handleFavoriteRowDragOver = useCallback(
    (rowIndex: number, e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (!favoriteDragActiveRef.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;
      setFavoriteDropInsertIndex(insertBefore ? rowIndex : rowIndex + 1);
    },
    [],
  );

  const handleFavoriteRowDrop = useCallback(
    (rowIndex: number, e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const draggedId = e.dataTransfer.getData("text/plain").trim();
      if (!draggedId) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const insertBefore = e.clientY < rect.top + rect.height / 2;
      const insertIndex = insertBefore ? rowIndex : rowIndex + 1;
      void reorderFavoriteToInsertIndex(draggedId, insertIndex);
    },
    [reorderFavoriteToInsertIndex],
  );

  const isSearchActive = query.trim().length > 0;

  const filteredModels = useMemo(() => {
    const q = query.trim().toLowerCase();
    const searchingAll = q.length > 0;

    let list: ChatModelConfig[];
    if (searchingAll) {
      list = CHAT_MODELS.toSorted();
    } else {
      list =
        activeSidebar === "favorites"
          ? validFavoriteModelIds.flatMap((modelId) => {
              const model = modelById.get(modelId);
              return model ? [model] : [];
            })
          : CHAT_MODELS.filter((m) => m.maker === activeSidebar);
    }

    if (q) {
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.makerName.toLowerCase().includes(q),
      );
    }
    if (selectedFeatureFilters.length > 0) {
      list = list.filter((m) =>
        modelMatchesFeatureFilters(m, selectedFeatureFilters),
      );
    }
    if (minKnowledgeCutoff) {
      list = list.filter((m) =>
        modelMatchesMinKnowledgeCutoff(m, minKnowledgeCutoff),
      );
    }

    const preserveFavoriteOrder =
      activeSidebar === "favorites" &&
      !q &&
      selectedFeatureFilters.length === 0 &&
      !minKnowledgeCutoff;
    if (!preserveFavoriteOrder) {
      list = list.toSorted(compareChatModelsByReleaseDateNewestFirst);
    }

    return list;
  }, [
    activeSidebar,
    modelById,
    query,
    selectedFeatureFilters,
    minKnowledgeCutoff,
    validFavoriteModelIds,
  ]);

  const clearFilters = useCallback(() => {
    setSelectedFeatureFilters([]);
    setMinKnowledgeCutoff(null);
  }, []);

  const resetPickerDismissState = useCallback(() => {
    setQuery("");
    setSelectedFeatureFilters([]);
    setMinKnowledgeCutoff(null);
    setModelFiltersPopoverOpen(false);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) {
        setNavColumn("search");
        setListNavIndex(-1);
        if (activeSidebar === "favorites") setSidebarNavIndex(0);
        else {
          const i = sidebarProviders.findIndex((p) => p.slug === activeSidebar);
          setSidebarNavIndex(i >= 0 ? i + 1 : 0);
        }
      } else {
        resetPickerDismissState();
      }
    },
    [activeSidebar, sidebarProviders, resetPickerDismissState],
  );

  const handleUserOpenChange = useCallback(
    (next: boolean) => {
      handleOpenChange(next);

      if (!next) {
        requestFocusComposer();
      }
    },
    [handleOpenChange],
  );

  const handleToggleOpen = useCallback(() => {
    setOpen((current) => {
      const next = !current;

      if (next) {
        setNavColumn("search");
        setListNavIndex(-1);
        if (activeSidebar === "favorites") setSidebarNavIndex(0);
        else {
          const i = sidebarProviders.findIndex((p) => p.slug === activeSidebar);
          setSidebarNavIndex(i >= 0 ? i + 1 : 0);
        }
      } else {
        resetPickerDismissState();
        requestFocusComposer();
      }

      return next;
    });
  }, [activeSidebar, resetPickerDismissState, sidebarProviders]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpenRequest = (event: Event) => {
      const detail = (
        event as CustomEvent<ModelSelectorRequestDetail | undefined>
      ).detail;

      if (detail?.toggle) {
        handleToggleOpen();
        return;
      }

      handleOpenChange(detail?.open ?? true);
    };
    window.addEventListener(OPEN_MODEL_SELECTOR_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener(OPEN_MODEL_SELECTOR_EVENT, onOpenRequest);
    };
  }, [handleOpenChange, handleToggleOpen]);

  const pickModelAt = useCallback(
    (index: number) => {
      const m = filteredModels[index];
      if (!m) return;
      posthog.capture("model_changed", {
        model_id: m.id,
        model_name: m.name,
        maker: m.maker,
        previous_model_id: selectedModel,
      });
      onModelChange(m.id);
      setOpen(false);
      resetPickerDismissState();
      requestFocusComposer();
    },
    [
      filteredModels,
      onModelChange,
      posthog,
      resetPickerDismissState,
      selectedModel,
    ],
  );

  const activateSidebarSlotByNavIndex = useCallback(
    (idx: number) => {
      if (idx === 0) setActiveSidebar("favorites");
      else {
        const p = sidebarProviders[idx - 1];
        if (p) setActiveSidebar(p.slug);
      }
    },
    [sidebarProviders],
  );

  const effectiveListNavIndex = useMemo(() => {
    if (filteredModels.length === 0) return -1;
    if (listNavIndex < 0) return -1;
    return Math.min(listNavIndex, filteredModels.length - 1);
  }, [filteredModels, listNavIndex]);

  useEffect(() => {
    if (effectiveListNavIndex < 0) return;
    const m = filteredModels[effectiveListNavIndex];
    if (!m) return;
    optionRefs.current?.get(m.id)?.scrollIntoView({ block: "nearest" });
  }, [effectiveListNavIndex, filteredModels]);

  const canReorderFavorites =
    activeSidebar === "favorites" &&
    query.trim().length === 0 &&
    !hasActiveModelFilters &&
    validFavoriteModelIds.length > 1;

  const isFavoritesListView =
    activeSidebar === "favorites" &&
    query.trim().length === 0 &&
    !hasActiveModelFilters;

  const toggleFeatureFilter = useCallback((id: ModelFeatureFilterId) => {
    setSelectedFeatureFilters((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const isMobile = useIsMobile();

  useEffect(() => {
    if (!open || isMobile) return;
    let alive = true;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (alive) searchInputRef.current?.focus();
      });
    });
    return () => {
      alive = false;
      cancelAnimationFrame(id);
    };
  }, [open, isMobile]);

  const currentModel =
    CHAT_MODELS.find((m) => m.id === selectedModel) ?? CHAT_MODELS[0];

  const sidebarRailLayoutGroupId = `${favoritesLayoutGroupId}-sidebar-rail`;

  const activeOptionModel =
    effectiveListNavIndex >= 0
      ? filteredModels[effectiveListNavIndex]
      : undefined;
  const activeOptionId =
    activeOptionModel && (isSearchActive || navColumn === "list")
      ? `${optionIdPrefix}-opt-${activeOptionModel.id}`
      : undefined;

  return {
    selectedModel,
    open,
    setOpen,
    query,
    setQuery,
    selectedFeatureFilters,
    setSelectedFeatureFilters,
    minKnowledgeCutoff,
    setMinKnowledgeCutoff,
    modelFiltersPopoverOpen,
    setModelFiltersPopoverOpen,
    hasActiveModelFilters,
    favoriteDragId,
    favoriteDropInsertIndex,
    searchInputRef,
    listboxRef,
    optionRefs,
    listboxId,
    optionIdPrefix,
    favoritesLayoutGroupId,
    navColumn,
    setNavColumn,
    listNavIndex,
    setListNavIndex,
    sidebarNavIndex,
    setSidebarNavIndex,
    activeSidebar,
    setActiveSidebar,
    favoriteIds,
    sidebarProviders,
    validFavoriteModelIds,
    toggleFavorite,
    onFavoriteDragStart,
    onFavoriteDragEnd,
    handleFavoriteRowDragOver,
    handleFavoriteRowDrop,
    isSearchActive,
    filteredModels,
    clearFilters,
    resetPickerDismissState,
    handleOpenChange,
    handleUserOpenChange,
    pickModelAt,
    activateSidebarSlotByNavIndex,
    effectiveListNavIndex,
    canReorderFavorites,
    isFavoritesListView,
    toggleFeatureFilter,
    currentModel,
    sidebarRailLayoutGroupId,
    activeOptionId,
    onModelChange,
  };
}

export type ModelSelectorState = ReturnType<typeof useModelSelectorState>;
