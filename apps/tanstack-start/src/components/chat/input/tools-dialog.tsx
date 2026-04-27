import type React from "react";
import { FlaskConical, Search, Wrench } from "lucide-react";

import { Checkbox } from "@redux/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader className="gap-3">
          <div className="bg-primary/10 text-primary flex h-11 w-11 items-center justify-center rounded-2xl">
            <Wrench className="size-5" />
          </div>
          <div className="space-y-1">
            <DialogTitle>Tools</DialogTitle>
            <DialogDescription>
              Turn tools on per chat and adjust how they behave before you send
              the next message.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-3">
          <ToolCard
            description="Let the assistant search the web for current information and cite results during a reply."
            disabled={!settingsReady}
            icon={Search}
            title="Search"
          >
            <ToolToggleRow
              checked={isSearchEnabled}
              description="Allow live web search"
              disabled={!settingsReady}
              id="tool-search-enabled"
              label="Enabled"
              onCheckedChange={onSearchEnabledChange}
            />
          </ToolCard>

          <ToolCard
            description="Run Python in a cloud notebook workspace for calculations, data analysis, and file processing."
            disabled={!settingsReady}
            icon={FlaskConical}
            title="Analysis"
          >
            <div className="space-y-3">
              <ToolToggleRow
                checked={isAnalysisWorkspaceEnabled}
                description="Allow notebook-style Python execution"
                disabled={!settingsReady}
                id="tool-analysis-workspace-enabled"
                label="Enabled"
                onCheckedChange={onAnalysisWorkspaceEnabledChange}
              />

              <div
                className={cn(
                  "border-border/70 bg-muted/20 rounded-xl border p-3 transition-opacity",
                  !isAnalysisWorkspaceEnabled &&
                    "pointer-events-none opacity-50",
                )}
              >
                <ToolToggleRow
                  checked={syncUploads}
                  description="Sync uploaded chat files into /home/user/uploads before code runs."
                  disabled={!settingsReady || !isAnalysisWorkspaceEnabled}
                  id="tool-analysis-workspace-sync-uploads"
                  label="Include uploaded files"
                  onCheckedChange={onAnalysisWorkspaceSyncUploadsChange}
                />
              </div>
            </div>
          </ToolCard>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ToolCard({
  children,
  description,
  disabled,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  disabled: boolean;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <section
      className={cn(
        "border-border/80 bg-card rounded-2xl border p-4",
        disabled && "opacity-80",
      )}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="bg-muted text-foreground flex h-10 w-10 items-center justify-center rounded-xl">
          <Icon className="size-4.5" />
        </div>
        <div className="space-y-1">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ToolToggleRow({
  checked,
  description,
  disabled,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex items-start justify-between gap-4 rounded-xl",
        disabled && "cursor-not-allowed",
      )}
      htmlFor={id}
    >
      <div className="space-y-1">
        <div className="text-sm font-medium">{label}</div>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
    </label>
  );
}
