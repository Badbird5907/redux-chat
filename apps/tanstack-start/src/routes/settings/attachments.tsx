"use no memo";

import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { usePaginatedQuery } from "convex/react";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent } from "@redux/ui/components/card";
import { Checkbox } from "@redux/ui/components/checkbox";
import { Skeleton } from "@redux/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@redux/ui/components/table";

import { deleteSettingsAttachments } from "@/server/attachments";

const PAGE_SIZE = 25;
const MAX_DELETE_COUNT = 100;

export const Route = createFileRoute("/settings/attachments")({
  ssr: false,
  component: AttachmentsRouteComponent,
  head: () => ({
    meta: [{ title: "Attachments | Redux Chat" }],
  }),
});

type AttachmentRow = (typeof api.functions.attachments.listForSettings)["_returnType"]["page"][number];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(timestamp: number | undefined) {
  if (timestamp === undefined) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function getAttachmentScope(attachment: AttachmentRow) {
  if (attachment.chatProjectId) {
    return "Project file";
  }
  if (attachment.status === "draft") {
    return "Draft";
  }
  return "Chat";
}

function getAttachmentStatus(attachment: AttachmentRow) {
  if (attachment.expired) {
    return "Expired";
  }
  if (attachment.expiresAt === undefined) {
    return "Unexpired";
  }
  return "Active";
}

function AttachmentsRouteComponent() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState(false);
  const deleteAttachments = useServerFn(deleteSettingsAttachments);
  const attachments = usePaginatedQuery(
    api.functions.attachments.listForSettings,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  const selectableIds = useMemo(
    () =>
      attachments.results
        .filter((attachment) => !attachment.expired)
        .map((attachment) => attachment.attachmentId),
    [attachments.results],
  );

  const selectedCount = selectedIds.size;
  const allLoadedSelected =
    selectableIds.length > 0 &&
    selectableIds.every((attachmentId) => selectedIds.has(attachmentId));
  const someLoadedSelected =
    selectableIds.some((attachmentId) => selectedIds.has(attachmentId)) &&
    !allLoadedSelected;

  const toggleSelectAllLoaded = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const attachmentId of selectableIds) {
        if (checked) {
          next.add(attachmentId);
        } else {
          next.delete(attachmentId);
        }
      }
      return next;
    });
  };

  const toggleSelected = (attachmentId: string, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(attachmentId);
      } else {
        next.delete(attachmentId);
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const attachmentIds = [...selectedIds].slice(0, MAX_DELETE_COUNT);
    if (attachmentIds.length === 0) {
      return;
    }

    if (
      !window.confirm(
        `Delete ${attachmentIds.length} attachment${attachmentIds.length === 1 ? "" : "s"}? This also removes cached derivatives.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteAttachments({
        data: { attachmentIds },
      });
      setSelectedIds(new Set());
      toast.success(
        `Deleted ${result.deletedCount} attachment${result.deletedCount === 1 ? "" : "s"}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete attachments",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Attachments</h1>
        <p className="text-muted-foreground max-w-3xl text-sm">
          Review uploaded attachments and delete files that have not expired.
          Deleting an attachment also removes generated derivatives.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground text-sm">
              {selectedCount > 0
                ? `${selectedCount} selected`
                : "Select unexpired attachments to delete them."}
            </div>
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedCount === 0 || deleting}
              onClick={() => void handleDeleteSelected()}
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              {deleting ? "Deleting..." : "Delete selected"}
            </Button>
          </div>

          <div className="border-border/60 overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Select all loaded attachments"
                      checked={allLoadedSelected}
                      indeterminate={someLoadedSelected}
                      disabled={selectableIds.length === 0 || deleting}
                      onCheckedChange={(checked) =>
                        toggleSelectAllLoaded(checked === true)
                      }
                    />
                  </TableHead>
                  <TableHead>File</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead>Expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachments.status === "LoadingFirstPage" ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={7}>
                        <Skeleton className="h-8 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : attachments.results.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center">
                      <div className="text-muted-foreground flex flex-col items-center gap-2 text-sm">
                        <FileText className="size-6" />
                        No attachments found.
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  attachments.results.map((attachment) => {
                    const isSelected = selectedIds.has(attachment.attachmentId);
                    const canDelete = !attachment.expired;

                    return (
                      <TableRow
                        key={attachment.attachmentId}
                        data-state={isSelected ? "selected" : undefined}
                      >
                        <TableCell>
                          <Checkbox
                            aria-label={`Select ${attachment.fileName}`}
                            checked={isSelected}
                            disabled={!canDelete || deleting}
                            onCheckedChange={(checked) =>
                              toggleSelected(
                                attachment.attachmentId,
                                checked === true,
                              )
                            }
                          />
                        </TableCell>
                        <TableCell className="max-w-[22rem]">
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="truncate font-medium">
                              {attachment.fileName}
                            </span>
                            <span className="text-muted-foreground truncate text-xs">
                              {attachment.mimeType}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">
                            {getAttachmentScope(attachment)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              attachment.expired ? "outline" : "secondary"
                            }
                          >
                            {getAttachmentStatus(attachment)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatFileSize(attachment.size)}
                        </TableCell>
                        <TableCell>{formatDate(attachment.createdAt)}</TableCell>
                        <TableCell>{formatDate(attachment.expiresAt)}</TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground text-xs">
              Showing {attachments.results.length} loaded attachment
              {attachments.results.length === 1 ? "" : "s"}.
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={attachments.status !== "CanLoadMore"}
              onClick={() => attachments.loadMore(PAGE_SIZE)}
            >
              {attachments.status === "LoadingMore" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {attachments.status === "CanLoadMore"
                ? "Load more"
                : attachments.status === "LoadingMore"
                  ? "Loading..."
                  : "All loaded"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
