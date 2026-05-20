"use client";

import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import {
  Copy,
  Eye,
  GitFork,
  LocateFixed,
  Plus,
  RefreshCw,
  Trash,
} from "lucide-react";
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
import { Switch } from "@redux/ui/components/switch";
import { cn } from "@redux/ui/lib/utils";

import {
  jumpToThreadBranch,
  updateShareToCurrentBranch,
} from "@/components/chat/branch-events";
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
  const updateSelectedBranch = useMutation(
    api.functions.threadShares.updateSelectedBranch,
  );
  const removeShare = useMutation(api.functions.threadShares.remove);
  const selectThreadBranch = useMutation(
    api.functions.threads.selectThreadBranch,
  );
  const navigate = useNavigate();
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

  const handleUpdateSelectedBranch = async (shareId: string) => {
    const share = shares.find((candidate) => candidate.shareId === shareId);
    const isActiveThread =
      share &&
      typeof window !== "undefined" &&
      window.location.pathname === `/chat/${share.threadId}`;

    if (share && isActiveThread) {
      setBusyShareId(shareId);
      updateShareToCurrentBranch({
        shareId,
        threadId: share.threadId,
        onSuccess: () => {
          setBusyShareId(undefined);
          toast.success("Shared branch updated");
        },
        onError: (error) => {
          setBusyShareId(undefined);
          toast.error(
            error instanceof Error ? error.message : "Failed to update branch",
          );
        },
      });
      return;
    }

    setBusyShareId(shareId);
    try {
      await updateSelectedBranch({ shareId });
      toast.success("Shared branch updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update branch",
      );
    } finally {
      setBusyShareId(undefined);
    }
  };

  const handleJumpToBranch = async (share: {
    shareId: string;
    threadId: string;
    lockedBranch?: { messageId: string; preview: string };
  }) => {
    if (!share.lockedBranch) {
      return;
    }

    setBusyShareId(share.shareId);
    try {
      const isActiveThread =
        typeof window !== "undefined" &&
        window.location.pathname === `/chat/${share.threadId}`;
      if (isActiveThread) {
        jumpToThreadBranch({
          threadId: share.threadId,
          leafMessageId: share.lockedBranch.messageId,
        });
      } else {
        await selectThreadBranch({
          threadId: share.threadId,
          leafMessageId: share.lockedBranch.messageId,
        });
      }
      onOpenChange(false);
      await navigate({
        to: "/chat/$id",
        params: { id: share.threadId },
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to jump to branch",
      );
    } finally {
      setBusyShareId(undefined);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-0 gap-5 overflow-hidden p-6 sm:max-w-2xl">
        <DialogHeader className="flex-row items-start justify-between gap-4 space-y-0 pr-8">
          <div className="min-w-0 space-y-1">
            <DialogTitle>Share thread</DialogTitle>
            <DialogDescription>
              Create and manage public links for this thread.
            </DialogDescription>
          </div>
          <Button
            className="shrink-0"
            onClick={() => void handleCreate()}
            disabled={!threadId || creating || shares.length >= 5}
          >
            <Plus className="size-4" />
            {creating ? "Creating..." : "Create link"}
          </Button>
        </DialogHeader>

        {shares.length === 0 ? (
          <p className="text-muted-foreground py-2 text-center text-sm">
            No share links yet.
          </p>
        ) : (
          <div className="min-w-0 space-y-3">
            {shares.map((share) => {
              const isBusy = busyShareId === share.shareId;
              const url = `${origin}/share/${share.shareId}`;

              return (
                <div
                  key={share.shareId}
                  className="border-border bg-muted/20 min-w-0 overflow-hidden rounded-lg border text-sm"
                >
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 space-y-2">
                      <div className="truncate font-mono text-xs">{url}</div>
                      <div className="text-muted-foreground flex items-center gap-3 text-xs">
                        <span
                          className="inline-flex items-center gap-1"
                          title="Views"
                        >
                          <Eye className="size-3.5" />
                          {share.viewCount}
                        </span>
                        <span
                          className="inline-flex items-center gap-1"
                          title="Forks"
                        >
                          <GitFork className="size-3.5" />
                          {share.forkCount}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center self-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Copy link"
                        onClick={() => void handleCopy(share.shareId)}
                      >
                        <Copy />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Delete link"
                        disabled={isBusy}
                        onClick={() => void handleRemove(share.shareId)}
                      >
                        <Trash />
                      </Button>
                    </div>
                  </div>

                  <div className="border-border divide-border border-t px-3 py-1">
                    <ShareSettingSwitch
                      checked={share.settings.onlyCurrentBranch}
                      disabled={isBusy}
                      label="Selected branch only"
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

                  {share.settings.onlyCurrentBranch ? (
                    <div className="border-border flex min-w-0 items-center gap-2 border-t px-3 py-2.5">
                      <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
                        Locked:{" "}
                        {share.lockedBranch?.preview ??
                          "current selected branch"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Jump to branch"
                        disabled={isBusy || !share.lockedBranch}
                        onClick={() => void handleJumpToBranch(share)}
                      >
                        <LocateFixed />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        tooltip="Update to current branch"
                        disabled={isBusy}
                        onClick={() =>
                          void handleUpdateSelectedBranch(share.shareId)
                        }
                      >
                        <RefreshCw />
                      </Button>
                    </div>
                  ) : (
                    <div className="border-border text-muted-foreground border-t px-3 py-2.5 text-xs">
                      Sharing all branches in this thread
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
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
    <Label
      className={cn(
        "flex min-w-0 items-center justify-between gap-4 py-2 text-sm font-normal",
        disabled && "opacity-50",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <Switch
        className="shrink-0"
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </Label>
  );
}
