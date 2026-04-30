import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback } from "react";

import type { ModelSelectorState } from "./use-model-selector-state";

type KeyboardState = Pick<
  ModelSelectorState,
  | "open"
  | "isSearchActive"
  | "filteredModels"
  | "sidebarProviders"
  | "activeSidebar"
  | "navColumn"
  | "setNavColumn"
  | "sidebarNavIndex"
  | "setSidebarNavIndex"
  | "setListNavIndex"
  | "effectiveListNavIndex"
  | "pickModelAt"
  | "activateSidebarSlotByNavIndex"
  | "searchInputRef"
>;

export function useModelSelectorKeyboard(s: KeyboardState) {
  const {
    open,
    isSearchActive,
    filteredModels,
    sidebarProviders,
    activeSidebar,
    navColumn,
    setNavColumn,
    sidebarNavIndex,
    setSidebarNavIndex,
    setListNavIndex,
    effectiveListNavIndex,
    pickModelAt,
    activateSidebarSlotByNavIndex,
    searchInputRef,
  } = s;

  return useCallback(
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
      setNavColumn,
      sidebarNavIndex,
      setSidebarNavIndex,
      setListNavIndex,
      effectiveListNavIndex,
      pickModelAt,
      activateSidebarSlotByNavIndex,
      searchInputRef,
    ],
  );
}
