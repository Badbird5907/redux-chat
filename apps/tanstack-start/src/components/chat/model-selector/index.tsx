import type {
  DragEvent,
  MouseEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConvexAuth, useMutation } from "convex/react";
import { ChevronDown, Search, Star } from "lucide-react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { toast } from "sonner";

import type { ChatModelConfig } from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";
import {
  CHAT_MODELS,
  getModelDisplayName,
  PROVIDERS,
} from "@redux/shared/models";
import { Button } from "@redux/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@redux/ui/components/popover";
import { useTheme } from "@redux/ui/components/theme";
import { cn } from "@redux/ui/lib/utils";

import type {
  MinKnowledgeCutoff,
  ModelFeatureFilterId,
} from "./feature-filters";
import {
  getSharedProviderLogo,
  LOGO_REGISTRY,
} from "@/components/logos/registry";
import { useQuery } from "@/lib/hooks/convex";
import { Capabilities } from "./capabilities";
import {
  ModelFeatureFilters,
  modelMatchesFeatureFilters,
  modelMatchesMinKnowledgeCutoff,
} from "./feature-filters";

function providerLogoEntry(maker: string) {
  if (maker in LOGO_REGISTRY) {
    return LOGO_REGISTRY[maker as keyof typeof LOGO_REGISTRY];
  }
  return getSharedProviderLogo(maker);
}

function ProviderGlyph({
  maker,
  className,
}: {
  maker: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const entry = providerLogoEntry(maker);
  const Cmp = resolvedTheme === "dark" ? entry?.LogoWhite : entry?.Logo;
  if (!Cmp) return null;
  return <Cmp className={cn("size-5", className)} aria-hidden />;
}

type ModelSelectorNavColumn = "search" | "sidebar" | "list";

function ModelRowSubtitle({ model }: { model: ChatModelConfig }) {
  const { resolvedTheme } = useTheme();
  const entry = providerLogoEntry(model.maker);
  const Cmp = resolvedTheme === "dark" ? entry?.LogoWhite : entry?.Logo;
  return (
    <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px] leading-none">
      {Cmp ? <Cmp className="size-3 shrink-0 opacity-90" aria-hidden /> : null}
      <span className="truncate">{model.makerName}</span>
    </div>
  );
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export function ModelSelector({
  selectedModel,
  onModelChange,
}: ModelSelectorProps) {
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
  const optionRefs = useRef<Map<string, HTMLDivElement>>(new Map());
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
      list = [...CHAT_MODELS];
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

  const pickModelAt = useCallback(
    (index: number) => {
      const m = filteredModels[index];
      if (!m) return;
      onModelChange(m.id);
      setOpen(false);
      resetPickerDismissState();
    },
    [filteredModels, onModelChange, resetPickerDismissState],
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
    optionRefs.current.get(m.id)?.scrollIntoView({ block: "nearest" });
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

  const handleMenuKeyDownCapture = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!open) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Escape") return;

      const target = e.target as HTMLElement;
      const menuEl = e.currentTarget;
      if (!menuEl.contains(target)) return;

      const inSearch = Boolean(searchInputRef.current?.contains(target));
      const inSidebarRail = Boolean(
        target.closest("[data-model-selector-sidebar]"),
      );
      const inListbox = Boolean(target.closest('[role="listbox"]'));

      if (!inSearch && !inSidebarRail && !inListbox) return;

      const modelCount = filteredModels.length;
      const sidebarSlots = 1 + sidebarProviders.length;

      const resolveSidebarNavIndexFromActive = () => {
        if (activeSidebar === "favorites") return 0;
        const i = sidebarProviders.findIndex((p) => p.slug === activeSidebar);
        return i >= 0 ? i + 1 : 0;
      };

      const isFavoriteStarButton = (el: HTMLElement) => {
        const btn = el.closest("button");
        if (!btn) return false;
        const label = btn.getAttribute("aria-label") ?? "";
        return label.toLowerCase().includes("favorite");
      };

      if (e.key === "Enter" || e.key === " ") {
        if (isFavoriteStarButton(target)) return;
        if (navColumn === "sidebar" && !isSearchActive) {
          e.preventDefault();
          activateSidebarSlotByNavIndex(sidebarNavIndex);
          return;
        }
        if (
          (navColumn === "list" || isSearchActive) &&
          effectiveListNavIndex >= 0
        ) {
          e.preventDefault();
          pickModelAt(effectiveListNavIndex);
          return;
        }
        return;
      }

      const key = e.key;
      if (
        key !== "ArrowUp" &&
        key !== "ArrowDown" &&
        key !== "ArrowLeft" &&
        key !== "ArrowRight"
      ) {
        return;
      }

      if (isSearchActive) {
        if (!inSearch) return;
        if (key === "ArrowLeft" || key === "ArrowRight") return;
        if (modelCount > 0) {
          e.preventDefault();
          setNavColumn("search");
          setListNavIndex((prev) => {
            if (prev < 0) return key === "ArrowDown" ? 0 : modelCount - 1;
            const delta = key === "ArrowDown" ? 1 : -1;
            return (prev + delta + modelCount) % modelCount;
          });
        }
        return;
      }

      const input = searchInputRef.current;

      if (inSearch && navColumn === "list" && key === "ArrowLeft") {
        e.preventDefault();
        setNavColumn("sidebar");
        setSidebarNavIndex(resolveSidebarNavIndexFromActive());
        return;
      }
      if (inSearch && navColumn === "list" && key === "ArrowRight") {
        return;
      }

      if (
        inSearch &&
        navColumn === "search" &&
        (key === "ArrowLeft" || key === "ArrowRight") &&
        input
      ) {
        const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
        const atEnd =
          input.selectionStart === input.value.length &&
          input.selectionEnd === input.value.length;
        if (key === "ArrowLeft" && atStart) {
          e.preventDefault();
          setNavColumn("sidebar");
          setSidebarNavIndex(resolveSidebarNavIndexFromActive());
          return;
        }
        if (key === "ArrowRight" && atEnd) {
          e.preventDefault();
          if (modelCount > 0) {
            setNavColumn("list");
            setListNavIndex((p) => (p < 0 ? 0 : p));
          }
          return;
        }
        return;
      }

      e.preventDefault();

      const bumpList = (delta: number) => {
        if (modelCount === 0) return;
        setNavColumn("list");
        setListNavIndex((prev) => {
          if (prev < 0) return delta > 0 ? 0 : modelCount - 1;
          return (prev + delta + modelCount) % modelCount;
        });
      };

      const bumpSidebar = (delta: number) => {
        if (sidebarSlots <= 0) return;
        setNavColumn("sidebar");
        setSidebarNavIndex(
          (prev) => (prev + delta + sidebarSlots) % sidebarSlots,
        );
      };

      switch (key) {
        case "ArrowDown":
          if (navColumn === "sidebar") bumpSidebar(1);
          else if (navColumn === "search") {
            if (modelCount > 0) {
              setNavColumn("list");
              setListNavIndex(0);
            }
          } else bumpList(1);
          break;
        case "ArrowUp":
          if (navColumn === "sidebar") bumpSidebar(-1);
          else if (navColumn === "search") {
            setNavColumn("sidebar");
            setSidebarNavIndex(resolveSidebarNavIndexFromActive());
          } else bumpList(-1);
          break;
        case "ArrowRight":
          if (navColumn === "sidebar" || navColumn === "search") {
            if (modelCount > 0) {
              setNavColumn("list");
              setListNavIndex((p) => (p < 0 ? 0 : p));
            }
          }
          break;
        case "ArrowLeft":
          if (navColumn === "sidebar") bumpSidebar(-1);
          else {
            setNavColumn("sidebar");
            setSidebarNavIndex(resolveSidebarNavIndexFromActive());
          }
          break;
        default:
          break;
      }
    },
    [
      open,
      isSearchActive,
      filteredModels,
      sidebarProviders,
      activeSidebar,
      navColumn,
      sidebarNavIndex,
      effectiveListNavIndex,
      pickModelAt,
      activateSidebarSlotByNavIndex,
    ],
  );

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  const currentModel =
    CHAT_MODELS.find((m) => m.id === selectedModel) ?? CHAT_MODELS[0];

  const panelSpring = {
    type: "spring" as const,
    stiffness: 420,
    damping: 34,
    mass: 0.85,
  };

  const sidebarAsideVariants = {
    open: {
      width: "3.5rem",
      opacity: 1,
      transition: {
        width: panelSpring,
        opacity: { duration: 0.22 },
        staggerChildren: 0.055,
        delayChildren: 0.07,
      },
    },
    closed: {
      width: 0,
      opacity: 0,
      transition: {
        width: panelSpring,
        opacity: { duration: 0.16 },
        staggerChildren: 0.03,
        staggerDirection: -1 as const,
      },
    },
  };

  const sidebarRailItemVariants = {
    open: {
      opacity: 1,
      scale: 1,
      x: 0,
      transition: panelSpring,
    },
    closed: {
      opacity: 0,
      scale: 0.88,
      x: -12,
      transition: { duration: 0.16 },
    },
  };

  const sidebarRailLayoutGroupId = `${favoritesLayoutGroupId}-sidebar-rail`;

  const activeOptionModel =
    effectiveListNavIndex >= 0
      ? filteredModels[effectiveListNavIndex]
      : undefined;
  const activeOptionId =
    activeOptionModel && (isSearchActive || navColumn === "list")
      ? `${optionIdPrefix}-opt-${activeOptionModel.id}`
      : undefined;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-muted h-7 gap-1.5 rounded-md px-2 text-xs"
          />
        }
      >
        {currentModel ? (
          <ProviderGlyph maker={currentModel.maker} className="size-3.5" />
        ) : null}
        <span className="font-medium">{currentModel?.name}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        onKeyDownCapture={handleMenuKeyDownCapture}
        className={cn(
          "bg-popover text-popover-foreground border-border/80 ring-foreground/10 flex max-h-[min(42rem,78vh)] min-h-[min(30rem,58vh)] w-[min(440px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border p-0 shadow-xl ring-1",
          "data-[side=top]:slide-in-from-bottom-2 gap-0",
        )}
      >
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

        <div className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch">
          <AnimatePresence initial={false} mode="popLayout">
            {!isSearchActive ? (
              <motion.aside
                key="model-selector-sidebar"
                variants={sidebarAsideVariants}
                initial="closed"
                animate="open"
                exit="closed"
                className="border-border/60 flex shrink-0 flex-col items-center overflow-hidden border-r pt-2.5 pb-2"
                style={{ minWidth: 0 }}
                data-model-selector-sidebar
              >
                <div className="flex w-14 shrink-0 flex-col items-center">
                  <motion.button
                    type="button"
                    title="Favorite models"
                    variants={sidebarRailItemVariants}
                    whileTap={{ scale: 0.92 }}
                    transition={panelSpring}
                    onClick={() => {
                      setActiveSidebar("favorites");
                      setSidebarNavIndex(0);
                      setNavColumn("sidebar");
                    }}
                    className={cn(
                      "mb-[9px] flex h-11 w-11 items-center justify-center rounded-lg transition-colors outline-none",
                      navColumn === "sidebar" &&
                        sidebarNavIndex === 0 &&
                        "ring-primary/45 ring-offset-background ring-2 ring-offset-2",
                      activeSidebar === "favorites"
                        ? "bg-muted text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Star
                      className={cn(
                        "size-5",
                        activeSidebar === "favorites" && "fill-current",
                      )}
                    />
                  </motion.button>
                  <motion.div
                    variants={sidebarRailItemVariants}
                    className="bg-border/60 mb-1.5 h-px w-8 shrink-0"
                    aria-hidden
                  />
                  <LayoutGroup id={sidebarRailLayoutGroupId}>
                    <div className="flex w-full flex-col items-center gap-0.5">
                      {sidebarProviders.map((p, providerIdx) => (
                        <motion.button
                          key={p.slug}
                          type="button"
                          title={p.name}
                          variants={sidebarRailItemVariants}
                          whileTap={{ scale: 0.92 }}
                          transition={panelSpring}
                          onClick={() => {
                            setActiveSidebar(p.slug);
                            setSidebarNavIndex(providerIdx + 1);
                            setNavColumn("sidebar");
                          }}
                          className={cn(
                            "relative flex h-11 w-11 items-center justify-center rounded-lg transition-colors outline-none",
                            navColumn === "sidebar" &&
                              sidebarNavIndex === providerIdx + 1 &&
                              "ring-primary/45 ring-offset-background ring-2 ring-offset-2",
                            activeSidebar === p.slug
                              ? "bg-muted text-muted-foreground"
                              : "hover:bg-muted",
                          )}
                        >
                          <ProviderGlyph maker={p.slug} className="size-5" />
                          {activeSidebar === p.slug ? (
                            <motion.span
                              layoutId="model-selector-sidebar-provider-marker"
                              className="bg-primary absolute top-1.5 right-0 h-8 w-0.5 rounded-l"
                              transition={panelSpring}
                              aria-hidden
                            />
                          ) : null}
                        </motion.button>
                      ))}
                    </div>
                  </LayoutGroup>
                </div>
              </motion.aside>
            ) : null}
          </AnimatePresence>

          <motion.div
            layout="position"
            transition={panelSpring}
            className="min-h-0 min-w-0 flex-1"
          >
            <div
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              aria-label="Models"
              className="h-full min-h-0 overflow-y-auto overscroll-contain"
            >
              {filteredModels.length === 0 ? (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={panelSpring}
                  className="text-muted-foreground px-3 py-8 text-center text-sm"
                >
                  {activeSidebar === "favorites" &&
                  validFavoriteModelIds.length === 0 &&
                  !isSearchActive &&
                  !hasActiveModelFilters
                    ? "No favorites yet. Star a model to add it."
                    : isSearchActive || hasActiveModelFilters
                      ? "No models match your filters or search."
                      : "No models match your search."}
                </motion.p>
              ) : (
                <LayoutGroup id={favoritesLayoutGroupId}>
                  {filteredModels.map((model, rowIndex) => {
                    const selected = model.id === selectedModel;
                    const favorited = favoriteIds.has(model.id);
                    const showDropLineBefore =
                      canReorderFavorites &&
                      favoriteDragId !== null &&
                      favoriteDropInsertIndex === rowIndex;
                    const showDropLineAfter =
                      canReorderFavorites &&
                      favoriteDragId !== null &&
                      favoriteDropInsertIndex === rowIndex + 1;

                    const listKeyboardActive =
                      effectiveListNavIndex === rowIndex &&
                      (isSearchActive || navColumn === "list");

                    return (
                      <motion.div
                        key={model.id}
                        id={`${optionIdPrefix}-opt-${model.id}`}
                        ref={(el) => {
                          if (el) optionRefs.current.set(model.id, el);
                          else optionRefs.current.delete(model.id);
                        }}
                        layout={isFavoritesListView}
                        initial={false}
                        transition={panelSpring}
                        role="option"
                        aria-selected={selected}
                        aria-grabbed={
                          canReorderFavorites && favoriteDragId === model.id
                            ? true
                            : undefined
                        }
                        tabIndex={-1}
                        draggable={canReorderFavorites}
                        onClick={() => {
                          setListNavIndex(rowIndex);
                          setNavColumn("list");
                          onModelChange(model.id);
                          setOpen(false);
                          resetPickerDismissState();
                        }}
                        onDragStart={
                          canReorderFavorites
                            ? (e) =>
                                onFavoriteDragStart(
                                  model.id,
                                  e as unknown as DragEvent<HTMLDivElement>,
                                )
                            : undefined
                        }
                        onDragEnd={
                          canReorderFavorites ? onFavoriteDragEnd : undefined
                        }
                        onDragOver={
                          canReorderFavorites
                            ? (e) => handleFavoriteRowDragOver(rowIndex, e)
                            : undefined
                        }
                        onDrop={
                          canReorderFavorites
                            ? (e) => handleFavoriteRowDrop(rowIndex, e)
                            : undefined
                        }
                        className={cn(
                          "hover:bg-muted/80 flex w-full cursor-pointer items-start gap-2 px-3 py-2.5 text-left transition-colors outline-none",
                          selected && "bg-muted/60",
                          listKeyboardActive &&
                            "ring-primary/35 ring-2 ring-inset",
                          canReorderFavorites &&
                            favoriteDragId === model.id &&
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
                          onClick={(e) => void toggleFavorite(model.id, e)}
                          aria-label={
                            favorited
                              ? "Remove from favorites"
                              : "Add to favorites"
                          }
                        >
                          <Star
                            className={cn(
                              "size-4",
                              favorited && "fill-current",
                            )}
                          />
                        </Button>
                        <div className="min-w-0 flex-1">
                          <div className="text-foreground text-sm leading-tight font-semibold">
                            {getModelDisplayName(model.id)}
                          </div>
                          <ModelRowSubtitle model={model} />
                        </div>
                        <div className="shrink-0 self-start">
                          <Capabilities model={model} />
                        </div>
                      </motion.div>
                    );
                  })}
                </LayoutGroup>
              )}
            </div>
          </motion.div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
