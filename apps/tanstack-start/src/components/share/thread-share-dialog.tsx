"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Copy, Eye, GitFork, Plus, Trash } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Button } from "@redux/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@redux/ui/components/dialog";
import { Label } from "@redux/ui/components/label";
import { Separator } from "@redux/ui/components/separator";
import { Switch } from "@redux/ui/components/switch";

import { useQuery } from "@/lib/hooks/convex";

type ShareSettings = {
  onlyCurrentBranch: boolean;
  includeAttachments: boolean;
  autoUpdate: boolean;
};

const DEFAULT_SHARE_SETTINGS: ShareSettings = {
  onlyCurrentBranch: true,
  includeAttachments: true,
  autoUpdate: false,
};

export function ThreadShareDialog({
  open,
  threadId,
  onOpenChange,
}: {
  open: boolean;
  threadId: string | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const shares =
    useQuery(
      api.functions.threadShares.listForThread,
      { threadId: threadId ?? "" },
      { default: [], skip: !open || !threadId },
    ) ?? [];
  const createShare = useMutation(api.functions.threadShares.create);
  const updateShare = useMutation(api.functions.threadShares.update);
  const removeShare = useMutation(api.functions.threadShares.remove);
  const [busyShareId, setBusyShareId] = useState<string | undefined>();
  const [creating, setCreating] = useState(false);

  const origin = useMemo(() => {
    if (typeof window === "undefined") {
      return "";
    }
    return window.location.origin;
  }, []);

  const handleCreate = async () => {
    if (!threadId || creating) return;

    setCreating(true);
    try {
      const result = await createShare({
        threadId,
        settings: DEFAULT_SHARE_SETTINGS,
      });
      await navigator.clipboard.writeText(`${origin}/share/${result.shareId}`);
      toast.success("Share link created and copied");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create share link",
      );
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (shareId: string) => {
    await navigator.clipboard.writeText(`${origin}/share/${shareId}`);
    toast.success("Share link copied");
  };

  const handleUpdate = async (
    shareId: string,
    settings: ShareSettings,
    patch: Partial<ShareSettings>,
  ) => {
    setBusyShareId(shareId);
    try {
      await updateShare({
        shareId,
        settings: {
          ...settings,
          ...patch,
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update share link",
      );
    } finally {
      setBusyShareId(undefined);
    }
  };

  const handleRemove = async (shareId: string) => {
    setBusyShareId(shareId);
    try {
      await removeShare({ shareId });
      toast.success("Share link deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete share link",
      );
    } finally {
      setBusyShareId(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Share thread</DialogTitle>
          <DialogDescription>
            Create and manage public links for this thread.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between gap-4">
          <div className="text-muted-foreground text-sm">
            {shares.length}/5 links
          </div>
          <Button
            onClick={() => void handleCreate()}
            disabled={!threadId || creating || shares.length >= 5}
          >
            <Plus className="size-4" />
            {creating ? "Creating..." : "Create link"}
          </Button>
        </div>

        <div className="space-y-3">
          {shares.length === 0 ? (
            <div className="border-border bg-muted/25 rounded-lg border p-4 text-sm">
              No share links yet.
            </div>
          ) : (
            shares.map((share) => {
              const isBusy = busyShareId === share.shareId;
              const url = `${origin}/share/${share.shareId}`;

              return (
                <div
                  key={share.shareId}
                  className="border-border rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs">{url}</div>
                      <div className="text-muted-foreground mt-2 flex items-center gap-4 text-xs">
                        <span className="inline-flex items-center gap-1">
                          <Eye className="size-3.5" />
                          {share.viewCount}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <GitFork className="size-3.5" />
                          {share.forkCount}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => void handleCopy(share.shareId)}
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={isBusy}
                        onClick={() => void handleRemove(share.shareId)}
                      >
                        <Trash className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="grid gap-3 sm:grid-cols-3">
                    <ShareSettingSwitch
                      checked={share.settings.onlyCurrentBranch}
                      disabled={isBusy}
                      label="Only current branch"
                      onCheckedChange={(checked) =>
                        void handleUpdate(share.shareId, share.settings, {
                          onlyCurrentBranch: checked,
                        })
                      }
                    />
                    <ShareSettingSwitch
                      checked={share.settings.includeAttachments}
                      disabled={isBusy}
                      label="Include attachments"
                      onCheckedChange={(checked) =>
                        void handleUpdate(share.shareId, share.settings, {
                          includeAttachments: checked,
                        })
                      }
                    />
                    <ShareSettingSwitch
                      checked={share.settings.autoUpdate}
                      disabled={isBusy}
                      label="Auto update"
                      onCheckedChange={(checked) =>
                        void handleUpdate(share.shareId, share.settings, {
                          autoUpdate: checked,
                        })
                      }
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShareSettingSwitch({
  checked,
  disabled,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Label className="border-border flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </Label>
  );
}
