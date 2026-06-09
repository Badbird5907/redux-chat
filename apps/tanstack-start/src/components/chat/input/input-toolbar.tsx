import type React from "react";
import type { RefObject } from "react";
import { useState } from "react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import {
  ArrowUp,
  BookText,
  FlaskConical,
  Hammer,
  ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";

import type { ThinkingLevel } from "@redux/shared/models";
import { Button } from "@redux/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";
import { cn } from "@redux/ui/lib/utils";

import { ModelSelector } from "@/components/chat/model-selector";
import McpLogo from "@/components/logos/mcp";
import { useResolvedHotkey } from "@/lib/hotkeys";
import { ReasoningLevelSelector } from "./reasoning-level-selector";

interface ChatInputToolbarProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  acceptedFileTypes: string;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  dropdownOpen: boolean;
  onDropdownOpenChange: (open: boolean) => void;
  onOpenFilePicker: () => void;
  onOpenMcpSettings: () => void;
  instructions: {
    instructionId: string;
    name: string;
    isDefault: boolean;
    isBuiltin: boolean;
  }[];
  selectedInstructionId?: string;
  selectedInstructionName?: string;
  onInstructionChange: (instructionId: string) => void;
  state: {
    instructionsReady: boolean;
    canUploadFiles: boolean;
    isAnalysisWorkspaceEnabled: boolean;
    isImageGenerationEnabled: boolean;
    isBashWorkspaceEnabled: boolean;
    isSearchEnabled: boolean;
    settingsReady: boolean;
    isContentOverflowing: boolean;
    isExpanded: boolean;
    showTokenVisualization: boolean;
    canConfigureReasoning: boolean;
    hasUsableAttachments: boolean;
    isSubmitting: boolean;
    hasUploadingFiles: boolean;
    draftReady: boolean;
    isOutOfCredits: boolean;
  };
  imageGenerationModels: {
    id: string;
    name: string;
  }[];
  selectedImageGenerationModelId?: string;
  project?: string;
  onAnalysisWorkspaceEnabledChange: (enabled: boolean) => void;
  onImageGenerationEnabledChange: (enabled: boolean) => void;
  onImageGenerationModelChange: (modelId: string) => void;
  onBashWorkspaceEnabledChange: (enabled: boolean) => void;
  onToggleSearch: () => void;
  mcpServers: {
    mcpServerId: string;
    name: string;
  }[];
  enabledMcpServerIds: string[];
  onToggleMcpServer: (mcpServerId: string) => void;
  onToggleExpand: () => void;
  tokenCount: number;
  onTokenCountClick: () => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  thinkingLevel: ThinkingLevel;
  thinkingLevels: readonly ThinkingLevel[];
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  input: string;
  onSubmit: () => void;
  onStopGeneration?: () => void;
}

export function ChatInputToolbar({
  fileInputRef,
  acceptedFileTypes,
  onFileChange,
  dropdownOpen,
  onDropdownOpenChange,
  onOpenFilePicker,
  onOpenMcpSettings,
  instructions,
  selectedInstructionId,
  selectedInstructionName,
  onInstructionChange,
  state,
  imageGenerationModels,
  selectedImageGenerationModelId,
  onAnalysisWorkspaceEnabledChange,
  onImageGenerationEnabledChange,
  onImageGenerationModelChange,
  onBashWorkspaceEnabledChange,
  onToggleSearch,
  mcpServers,
  enabledMcpServerIds,
  onToggleMcpServer,
  onToggleExpand,
  tokenCount,
  onTokenCountClick,
  // project,
  selectedModel,
  onModelChange,
  thinkingLevel,
  thinkingLevels,
  onThinkingLevelChange,
  input,
  onSubmit,
  onStopGeneration,
}: ChatInputToolbarProps) {
  const uploadFileHotkey = useResolvedHotkey("chat.uploadFile");
  const {
    instructionsReady,
    canUploadFiles,
    isAnalysisWorkspaceEnabled,
    isImageGenerationEnabled,
    isBashWorkspaceEnabled,
    isSearchEnabled,
    settingsReady,
    isContentOverflowing,
    isExpanded,
    showTokenVisualization,
    canConfigureReasoning,
    hasUsableAttachments,
    isSubmitting,
    hasUploadingFiles,
    draftReady,
    isOutOfCredits,
  } = state;
  const [hasBeenReady, setHasBeenReady] = useState(settingsReady);
  if (settingsReady && !hasBeenReady) {
    setHasBeenReady(true);
  }
  const showModelControls = settingsReady || hasBeenReady;
  // const proj = useQuery(api.functions.projects.getProject, { projectId: project ?? ""}, { skip: !project });
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 px-2 pb-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={acceptedFileTypes}
          aria-label="Upload files"
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
                className="text-muted-foreground hover:text-foreground hover:bg-muted size-8 rounded-full"
              />
            }
          >
            <Plus className="size-5" />
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
                {formatForDisplay(uploadFileHotkey)}
              </DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                disabled={!instructionsReady || !settingsReady}
              >
                <BookText className="size-4 shrink-0" />
                <span className="min-w-0 grow whitespace-nowrap">
                  Instructions
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Choose instruction</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={selectedInstructionId ?? ""}
                    onValueChange={onInstructionChange}
                  >
                    {instructions.map((instruction) => (
                      <DropdownMenuRadioItem
                        key={instruction.instructionId}
                        value={instruction.instructionId}
                      >
                        <span className="min-w-0 grow whitespace-nowrap">
                          {instruction.name}
                        </span>
                        {!instruction.isDefault ? (
                          <span className="text-muted-foreground text-xs">
                            {instruction.isBuiltin ? "Built-in" : "Custom"}
                          </span>
                        ) : null}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!settingsReady}>
                <Hammer className="size-4 shrink-0" />
                <span className="min-w-0 grow whitespace-nowrap">Tools</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Tools</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem
                    checked={isSearchEnabled}
                    disabled={!settingsReady}
                    onCheckedChange={onToggleSearch}
                  >
                    <Search className="size-4 shrink-0" />
                    <span className="min-w-0 grow whitespace-nowrap">
                      Search
                    </span>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={isBashWorkspaceEnabled}
                    disabled={!settingsReady}
                    onCheckedChange={onBashWorkspaceEnabledChange}
                  >
                    <Terminal className="size-4 shrink-0" />
                    <span className="min-w-0 grow whitespace-nowrap">Bash</span>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={isAnalysisWorkspaceEnabled}
                    disabled={!settingsReady}
                    onCheckedChange={onAnalysisWorkspaceEnabledChange}
                  >
                    <FlaskConical className="size-4 shrink-0" />
                    <span className="min-w-0 grow whitespace-nowrap">
                      Analysis
                    </span>
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={isImageGenerationEnabled}
                    disabled={
                      !settingsReady || imageGenerationModels.length === 0
                    }
                    onCheckedChange={onImageGenerationEnabledChange}
                  >
                    <ImageIcon className="size-4 shrink-0" />
                    <span className="min-w-0 grow whitespace-nowrap">
                      Image Generation
                    </span>
                  </DropdownMenuCheckboxItem>
                  {isImageGenerationEnabled ? (
                    <DropdownMenuRadioGroup
                      value={selectedImageGenerationModelId}
                      onValueChange={onImageGenerationModelChange}
                    >
                      {imageGenerationModels.map((model) => (
                        <DropdownMenuRadioItem key={model.id} value={model.id}>
                          <span className="min-w-0 grow whitespace-nowrap">
                            {model.name}
                          </span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  ) : null}
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={!settingsReady}>
                <McpLogo className="size-4 shrink-0" />
                <span className="min-w-0 grow whitespace-nowrap">
                  MCP Servers
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>MCP Servers</DropdownMenuLabel>
                  {mcpServers.length > 0 ? (
                    mcpServers.map((server) => (
                      <DropdownMenuCheckboxItem
                        key={server.mcpServerId}
                        checked={enabledMcpServerIds.includes(
                          server.mcpServerId,
                        )}
                        disabled={!settingsReady}
                        onCheckedChange={() =>
                          onToggleMcpServer(server.mcpServerId)
                        }
                      >
                        <span className="min-w-0 grow whitespace-nowrap">
                          {server.name}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))
                  ) : (
                    <DropdownMenuItem disabled>
                      <span className="min-w-0 grow whitespace-nowrap">
                        No MCP servers configured
                      </span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={onOpenMcpSettings}>
                    <McpLogo className="size-4 shrink-0" />
                    <span className="min-w-0 grow whitespace-nowrap">
                      Manage MCP Servers
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          type="button"
          onClick={onToggleSearch}
          className={cn(
            "hidden shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors sm:flex",
            isSearchEnabled
              ? "bg-primary/60 border-primary/90 text-primary-foreground hover:bg-primary/20"
              : "hover:bg-muted/80 text-foreground border-border bg-none",
          )}
          disabled={!settingsReady}
        >
          <Search className="size-3.5" />
          <span>Search</span>
        </button>
        {/* {project && proj && (
          <Tooltip>
            <TooltipTrigger>
              <button type="button" className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors">
                <FolderKanban className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Project: {proj.name}</p>
            </TooltipContent>
          </Tooltip>
        )} */}
        {selectedInstructionName ? (
          <button
            type="button"
            onClick={() => onInstructionChange("")}
            title="Clear instruction"
            aria-label={`Clear instruction: ${selectedInstructionName}`}
            className="group border-border bg-muted/50 text-muted-foreground hover:border-destructive/60 hover:bg-destructive/10 hover:text-destructive inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors"
          >
            <BookText className="size-3.5 shrink-0 group-hover:hidden" />
            <Trash2 className="hidden size-3.5 shrink-0 group-hover:block" />
            <span className="min-w-0 truncate">{selectedInstructionName}</span>
          </button>
        ) : null}
      </div>

      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {isContentOverflowing && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground hover:bg-muted size-8 rounded-full"
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <Minimize2 className="size-4" />
            ) : (
              <Maximize2 className="size-4" />
            )}
          </Button>
        )}
        {tokenCount > 0 && (
          <button
            type="button"
            onClick={onTokenCountClick}
            className={cn(
              "hidden rounded-md px-2 py-1 text-xs tabular-nums transition-colors md:inline",
              showTokenVisualization
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
            title="Click to visualize tokens"
          >
            {tokenCount.toLocaleString()} tokens
          </button>
        )}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1 transition-opacity duration-200",
            showModelControls ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          aria-hidden={!showModelControls}
        >
          {canConfigureReasoning ? (
            <ReasoningLevelSelector
              thinkingLevel={thinkingLevel}
              thinkingLevels={thinkingLevels}
              onThinkingLevelChange={onThinkingLevelChange}
            />
          ) : null}
          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={onModelChange}
          />
        </div>
        {isSubmitting && onStopGeneration ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="size-8 rounded-full"
            onClick={onStopGeneration}
            title="Stop generating"
          >
            <Square className="size-3 fill-current" />
          </Button>
        ) : (
          <Button
            type="button"
            size="icon"
            className={cn(
              "size-8 rounded-full transition-all",
              input.trim() || hasUsableAttachments
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground",
            )}
            onClick={onSubmit}
            title={isOutOfCredits ? "You are out of credits" : "Send message"}
            disabled={
              isSubmitting ||
              isOutOfCredits ||
              hasUploadingFiles ||
              (!input.trim() && !hasUsableAttachments) ||
              !settingsReady ||
              !draftReady
            }
          >
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
