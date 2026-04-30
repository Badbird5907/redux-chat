import { ChevronDown } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@redux/ui/components/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@redux/ui/components/popover";
import { useIsMobile } from "@redux/ui/hooks/use-mobile";
import { cn } from "@redux/ui/lib/utils";

import { ModelSelectorModelList } from "./model-selector-model-list";
import { ModelSelectorSearchBar } from "./model-selector-search-bar";
import { ModelSelectorSidebarRail } from "./model-selector-sidebar-rail";
import { ProviderGlyph } from "./provider-glyph";
import { useModelSelectorKeyboard } from "./use-model-selector-keyboard";
import { useModelSelectorState } from "./use-model-selector-state";

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

const pickerSurfaceClassName = cn(
  "bg-popover text-popover-foreground border-border/80 ring-foreground/10 flex flex-col overflow-hidden rounded-xl border p-0 shadow-xl ring-1",
);

const triggerButtonClassName = cn(
  "text-muted-foreground hover:text-foreground hover:bg-muted h-7 gap-1.5 rounded-md px-2 text-xs",
);

export function ModelSelector({
  selectedModel,
  onModelChange,
}: ModelSelectorProps) {
  const state = useModelSelectorState({ selectedModel, onModelChange });
  const isMobile = useIsMobile();

  const handleMenuKeyDownCapture = useModelSelectorKeyboard({
    open: state.open,
    isSearchActive: state.isSearchActive,
    filteredModels: state.filteredModels,
    sidebarProviders: state.sidebarProviders,
    activeSidebar: state.activeSidebar,
    navColumn: state.navColumn,
    setNavColumn: state.setNavColumn,
    sidebarNavIndex: state.sidebarNavIndex,
    setSidebarNavIndex: state.setSidebarNavIndex,
    setListNavIndex: state.setListNavIndex,
    effectiveListNavIndex: state.effectiveListNavIndex,
    pickModelAt: state.pickModelAt,
    activateSidebarSlotByNavIndex: state.activateSidebarSlotByNavIndex,
    searchInputRef: state.searchInputRef,
  });

  const currentModelName = state.currentModel?.name ?? "";
  const maker = state.currentModel?.maker ?? "";

  const modelPickerBody = (
    <>
      <ModelSelectorSearchBar {...state} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-row items-stretch">
        <ModelSelectorSidebarRail {...state} />
        <ModelSelectorModelList {...state} />
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={state.open} onOpenChange={state.handleOpenChange}>
        <DrawerTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className={triggerButtonClassName}>
            <ProviderGlyph maker={maker} className="size-3.5" />
            <span className="font-medium">{currentModelName}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
          </Button>
        </DrawerTrigger>
        <DrawerContent
          className="flex max-h-[90vh] flex-col gap-0 p-0 ring-0 after:hidden"
          onKeyDownCapture={handleMenuKeyDownCapture}
        >
          <div
            className={cn(
              pickerSurfaceClassName,
              "max-h-[min(42rem,calc(90vh-2rem))] min-h-0 w-full max-w-full rounded-b-none border-x-0 border-b-0 shadow-none ring-0",
            )}
          >
            {modelPickerBody}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={state.open} onOpenChange={state.handleOpenChange}>
      <PopoverTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className={triggerButtonClassName} />
        }
      >
        <ProviderGlyph maker={maker} className="size-3.5" />
        <span className="font-medium">{currentModelName}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        sideOffset={8}
        onKeyDownCapture={handleMenuKeyDownCapture}
        className={cn(
          pickerSurfaceClassName,
          "max-h-[min(42rem,78vh)] min-h-[min(30rem,58vh)] w-[min(440px,calc(100vw-1.5rem))] gap-0",
          "data-[side=top]:slide-in-from-bottom-2",
        )}
      >
        {modelPickerBody}
      </PopoverContent>
    </Popover>
  );
}
