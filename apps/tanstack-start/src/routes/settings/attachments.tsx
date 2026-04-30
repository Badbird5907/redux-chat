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
import type {
  ColumnDef,
  RowSelectionState,
} from "@redux/ui/components/data-table";
import { DataTable } from "@redux/ui/components/data-table";

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

function getAttachmentId(attachment: AttachmentRow) {
  return attachment.attachmentId;
}

function AttachmentsRouteComponent() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [deleting, setDeleting] = useState(false);
  const deleteAttachments = useServerFn(deleteSettingsAttachments);
  const attachments = usePaginatedQuery(
    api.functions.attachments.listForSettings,
    {},
    { initialNumItems: PAGE_SIZE },
  );

  const enableRowSelection = (row: AttachmentRow) => !row.expired && !deleting;

  const columns = useMemo<ColumnDef<AttachmentRow>[]>(
    () => [
      {
        accessorKey: "fileName",
        header: "File",
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">
              {row.original.fileName}
            </span>
            <span className="text-muted-foreground truncate text-xs">
              {row.original.mimeType}
            </span>
          </div>
        ),
        meta: {
          cellClassName: "max-w-[22rem]",
        },
      },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => (
          <Badge variant="secondary">{getAttachmentScope(row.original)}</Badge>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={row.original.expired ? "outline" : "secondary"}>
            {getAttachmentStatus(row.original)}
          </Badge>
        ),
      },
      {
        accessorKey: "size",
        header: "Size",
        cell: ({ row }) => formatFileSize(row.original.size),
        meta: {
          headerClassName: "text-right",
          cellClassName: "text-right",
        },
      },
      {
        accessorKey: "createdAt",
        header: "Uploaded",
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        accessorKey: "expiresAt",
        header: "Expires",
        cell: ({ row }) => formatDate(row.original.expiresAt),
      },
    ],
    [],
  );

  const selectedIds = useMemo(
    () =>
      Object.entries(rowSelection)
        .filter(([, selected]) => selected)
        .map(([attachmentId]) => attachmentId),
    [rowSelection],
  );
  const selectedCount = selectedIds.length;
  const loadedSelectedCount = useMemo(
    () =>
      attachments.results.filter((attachment) =>
        selectedIds.includes(attachment.attachmentId),
      ).length,
    [attachments.results, selectedIds],
  );

  const handleDeleteSelected = async () => {
    const attachmentIds = selectedIds.slice(0, MAX_DELETE_COUNT);
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
      setRowSelection({});
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

          <DataTable
            columns={columns}
            data={attachments.results}
            loading={attachments.status === "LoadingFirstPage"}
            emptyMessage="No attachments found."
            emptyIcon={FileText}
            multiselect
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getRowId={getAttachmentId}
            enableRowSelection={enableRowSelection}
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground text-xs">
              Showing {attachments.results.length} loaded attachment
              {attachments.results.length === 1 ? "" : "s"}
              {selectedCount > loadedSelectedCount
                ? ` (${selectedCount - loadedSelectedCount} selected on other loaded pages)`
                : ""}
              .
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
