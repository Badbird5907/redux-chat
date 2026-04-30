import type React from "react";
import { FlaskConical, Search } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { Switch } from "@redux/ui/components/switch";
import { cn } from "@redux/ui/lib/utils";

interface ChatToolsDialogProps {
  isAnalysisWorkspaceEnabled: boolean;
  isSearchEnabled: boolean;
  onAnalysisWorkspaceEnabledChange: (enabled: boolean) => void;
  onAnalysisWorkspaceSyncUploadsChange: (enabled: boolean) => void;
  onOpenChange: (open: boolean) => void;
  onSearchEnabledChange: (enabled: boolean) => void;
  open: boolean;
  settingsReady: boolean;
  syncUploads: boolean;
}

export function ChatToolsDialog({
  isAnalysisWorkspaceEnabled,
  isSearchEnabled,
  onAnalysisWorkspaceEnabledChange,
  onAnalysisWorkspaceSyncUploadsChange,
  onOpenChange,
  onSearchEnabledChange,
  open,
  settingsReady,
  syncUploads,
}: ChatToolsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-[420px]">
        <DialogHeader className="border-border/80 space-y-1.5 border-b px-5 py-4 text-left">
          <DialogTitle className="text-base tracking-tight">
            Tools for this chat
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            Changes apply on your next message.
          </DialogDescription>
        </DialogHeader>

        <div
          className={cn(
            "divide-border/60 divide-y",
            !settingsReady && "pointer-events-none opacity-60",
          )}
        >
          <div className="px-5 py-4">
            <ToolBlock
              checked={isSearchEnabled}
              description="Web lookup with citations in replies."
              disabled={!settingsReady}
              icon={Search}
              id="tool-search-enabled"
              title="Search"
              onCheckedChange={onSearchEnabledChange}
            />
          </div>

          <div className="px-5 py-4">
            <ToolBlock
              checked={isAnalysisWorkspaceEnabled}
              description="Allow the agent to execute Python code in a Jupyter notebook."
              disabled={!settingsReady}
              icon={FlaskConical}
              id="tool-analysis-workspace-enabled"
              title="Analysis"
              onCheckedChange={onAnalysisWorkspaceEnabledChange}
            />

            <div
              className={cn(
                "bg-muted/35 mt-3 rounded-lg px-3 py-2.5 transition-opacity",
                !isAnalysisWorkspaceEnabled && "pointer-events-none opacity-45",
              )}
            >
              <SubToggle
                checked={syncUploads}
                disabled={!settingsReady || !isAnalysisWorkspaceEnabled}
                id="tool-analysis-workspace-sync-uploads"
                label="Download uploaded files to the VM"
                onCheckedChange={onAnalysisWorkspaceSyncUploadsChange}
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolBlock({
  checked,
  description,
  disabled,
  icon: Icon,
  id,
  onCheckedChange,
  title,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  id: string;
  onCheckedChange: (checked: boolean) => void;
  title: string;
}) {
  return (
    <div className="flex gap-3.5">
      <label
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer gap-3.5",
          disabled && "cursor-not-allowed",
        )}
        htmlFor={id}
      >
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-transparent transition-colors",
            checked
              ? "bg-primary/12 text-primary"
              : "bg-muted/50 text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </div>
        <span className="min-w-0">
          <span className="text-foreground block text-sm leading-snug font-medium">
            {title}
          </span>
          <span className="text-muted-foreground mt-1 block text-xs leading-relaxed">
            {description}
          </span>
        </span>
      </label>
      <Switch
        checked={checked}
        className="mt-1 self-start"
        disabled={disabled}
        id={id}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function SubToggle({
  checked,
  disabled,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex gap-3">
      <label
        className={cn(
          "flex min-w-0 flex-1 cursor-pointer",
          disabled && "cursor-not-allowed",
        )}
        htmlFor={id}
      >
        <span className="text-foreground block text-xs leading-snug font-medium">
          {label}
        </span>
      </label>
      <Switch
        checked={checked}
        className="mt-0.5 self-start"
        disabled={disabled}
        id={id}
        size="sm"
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
