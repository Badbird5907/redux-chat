import type React from "react";
import type { RefObject } from "react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import {
  ArrowUp,
  BookText,
  FlaskConical,
  Hammer,
  Loader2,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Square,
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
  instructionsReady: boolean;
  canUploadFiles: boolean;
  isAnalysisWorkspaceEnabled: boolean;
  isSearchEnabled: boolean;
  project?: string;
  onAnalysisWorkspaceEnabledChange: (enabled: boolean) => void;
  onToggleSearch: () => void;
  settingsReady: boolean;
  mcpServers: {
    mcpServerId: string;
    name: string;
  }[];
  enabledMcpServerIds: string[];
  onToggleMcpServer: (mcpServerId: string) => void;
  isContentOverflowing: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  tokenCount: number;
  showTokenVisualization: boolean;
  onTokenCountClick: () => void;
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  thinkingLevel: ThinkingLevel;
  thinkingLevels: readonly ThinkingLevel[];
  canConfigureReasoning: boolean;
  onThinkingLevelChange: (level: ThinkingLevel) => void;
  input: string;
  hasUsableAttachments: boolean;
  isSubmitting: boolean;
  hasUploadingFiles: boolean;
  draftReady: boolean;
  isOutOfCredits: boolean;
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
  instructionsReady,
  canUploadFiles,
  isAnalysisWorkspaceEnabled,
  isSearchEnabled,
  onAnalysisWorkspaceEnabledChange,
  onToggleSearch,
  settingsReady,
  mcpServers,
  enabledMcpServerIds,
  onToggleMcpServer,
  isContentOverflowing,
  isExpanded,
  onToggleExpand,
  tokenCount,
  showTokenVisualization,
  onTokenCountClick,
  // project,
  selectedModel,
  onModelChange,
  thinkingLevel,
  thinkingLevels,
  canConfigureReasoning,
  onThinkingLevelChange,
  input,
  hasUsableAttachments,
  isSubmitting,
  hasUploadingFiles,
  draftReady,
  isOutOfCredits,
  onSubmit,
  onStopGeneration,
}: ChatInputToolbarProps) {
  const uploadFileHotkey = useResolvedHotkey("chat.uploadFile");
  // const proj = useQuery(api.functions.projects.getProject, { projectId: project ?? ""}, { skip: !project });
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
                    checked={isAnalysisWorkspaceEnabled}
                    disabled={!settingsReady}
                    onCheckedChange={onAnalysisWorkspaceEnabledChange}
                  >
                    <FlaskConical className="size-4 shrink-0" />
                    <span className="min-w-0 grow whitespace-nowrap">
                      Analysis
                    </span>
                  </DropdownMenuCheckboxItem>
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
        {/* {project && proj && (
          <Tooltip>
            <TooltipTrigger>
              <button type="button" className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors">
                <FolderKanban className="h-4 w-4" />
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
            <BookText className="h-3.5 w-3.5 shrink-0 group-hover:hidden" />
            <Trash2 className="hidden h-3.5 w-3.5 shrink-0 group-hover:block" />
            <span>{selectedInstructionName}</span>
          </button>
        ) : null}
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
        {isSubmitting && onStopGeneration ? (
          <Button
            type="button"
            size="icon"
            variant="destructive"
            className="h-8 w-8 rounded-full"
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
              "h-8 w-8 rounded-full transition-all",
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
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
