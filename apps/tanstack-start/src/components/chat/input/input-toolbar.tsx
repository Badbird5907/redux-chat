import type { ModelConfig } from "@/lib/model-config";
import type React from "react";
import type { RefObject } from "react";
import {
  ArrowUp,
  Hammer,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@redux/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";
import { cn } from "@redux/ui/lib/utils";

import { ModelSelector } from "@/components/chat/model-selector";

interface ChatInputToolbarProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  acceptedFileTypes: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  dropdownOpen: boolean;
  onDropdownOpenChange: (open: boolean) => void;
  onOpenFilePicker: () => void;
  onOpenToolsDialog: () => void;
  canUploadFiles: boolean;
  isSearchEnabled: boolean;
  onToggleSearch: () => void;
  settingsReady: boolean;
  isContentOverflowing: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  tokenCount: number;
  showTokenVisualization: boolean;
  onTokenCountClick: () => void;
  models: ModelConfig[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  input: string;
  hasUsableAttachments: boolean;
  isSubmitting: boolean;
  hasUploadingFiles: boolean;
  draftReady: boolean;
  onSubmit: () => void;
}

export function ChatInputToolbar({
  fileInputRef,
  acceptedFileTypes,
  onFileChange,
  dropdownOpen,
  onDropdownOpenChange,
  onOpenFilePicker,
  onOpenToolsDialog,
  canUploadFiles,
  isSearchEnabled,
  onToggleSearch,
  settingsReady,
  isContentOverflowing,
  isExpanded,
  onToggleExpand,
  tokenCount,
  showTokenVisualization,
  onTokenCountClick,
  models,
  selectedModel,
  onModelChange,
  input,
  hasUsableAttachments,
  isSubmitting,
  hasUploadingFiles,
  draftReady,
  onSubmit,
}: ChatInputToolbarProps) {
  return (
    <div className="flex items-center justify-between px-2 pb-2">
      <div className="flex items-center gap-1">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedFileTypes}
          onChange={onFileChange}
          className="hidden"
        />
        <DropdownMenu open={dropdownOpen} onOpenChange={onDropdownOpenChange}>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 rounded-full"
              />
            }
          >
            <Plus className="h-5 w-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-max min-w-52">
            <DropdownMenuItem
              onClick={onOpenFilePicker}
              disabled={!canUploadFiles}
            >
              <Plus className="size-4 shrink-0" />
              <span className="min-w-0 grow whitespace-nowrap">
                Upload file
              </span>
              <DropdownMenuShortcut className="shrink-0">
                Ctrl+U
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onOpenToolsDialog}
              disabled={!settingsReady}
            >
              <Hammer className="size-4 shrink-0" />
              <span className="min-w-0 grow whitespace-nowrap">Tools</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onToggleSearch}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
            isSearchEnabled
              ? "bg-primary/60 border-primary/90 text-primary-foreground hover:bg-primary/20"
              : "hover:bg-muted/80 text-foreground border-border bg-none",
          )}
          disabled={!settingsReady}
        >
          <Search className="h-3.5 w-3.5" />
          <span>Search</span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        {isContentOverflowing && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 rounded-full"
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        )}
        {tokenCount > 0 && (
          <button
            type="button"
            onClick={onTokenCountClick}
            className={cn(
              "rounded-md px-2 py-1 text-xs tabular-nums transition-colors",
              showTokenVisualization
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            title="Click to visualize tokens"
          >
            {tokenCount.toLocaleString()} tokens
          </button>
        )}
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelChange={onModelChange}
        />
        <Button
          type="button"
          size="icon"
          className={cn(
            "h-8 w-8 rounded-full transition-all",
            input.trim() || hasUsableAttachments
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground",
          )}
          onClick={onSubmit}
          disabled={
            isSubmitting ||
            hasUploadingFiles ||
            (!input.trim() && !hasUsableAttachments) ||
            !settingsReady ||
            !draftReady
          }
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowUp className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
