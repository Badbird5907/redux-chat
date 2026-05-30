"use no memo";

import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { usePaginatedQuery } from "convex/react";
import { FileText, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type {
  ColumnDef,
  RowSelectionState,
} from "@redux/ui/components/data-table";
import { api } from "@redux/backend/convex/_generated/api";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card, CardContent } from "@redux/ui/components/card";
import { DataTable } from "@redux/ui/components/data-table";

import { deleteSettingsAttachments } from "@/server/attachments";

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const MAX_DELETE_COUNT = 100;

type AttachmentRow =
  (typeof api.functions.attachments.listForSettings)["_returnType"]["page"][number];

const attachmentDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(timestamp: number | undefined) {
  if (timestamp === undefined) {
    return "Never";
  }

  return attachmentDateFormatter.format(new Date(timestamp));
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

export function AttachmentsRouteComponent() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [deleting, setDeleting] = useState(false);
  const deleteAttachments = useServerFn(deleteSettingsAttachments);
  const attachments = usePaginatedQuery(
    api.functions.attachments.listForSettings,
    {},
    { initialNumItems: pageSize },
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
      Object.entries(rowSelection).flatMap(([attachmentId, selected]) =>
        selected ? [attachmentId] : [],
      ),
    [rowSelection],
  );
  const selectedCount = selectedIds.length;
  const loadedPages = Math.max(
    1,
    Math.ceil(attachments.results.length / pageSize),
  );
  const hasNextPage =
    page < loadedPages ||
    (page === loadedPages && attachments.status === "CanLoadMore");
  const pagedAttachments = attachments.results.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const loadedSelectedCount = useMemo(
    () =>
      attachments.results.filter((attachment) =>
        selectedIds.includes(attachment.attachmentId),
      ).length,
    [attachments.results, selectedIds],
  );

  const handlePageChange = (nextPage: number) => {
    let safeNextPage = Math.max(1, nextPage);
    if (safeNextPage > loadedPages) {
      if (attachments.status === "CanLoadMore") {
        attachments.loadMore(pageSize);
      } else {
        safeNextPage = loadedPages;
      }
    }
    setPage(safeNextPage);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      return;
    }

    if (selectedIds.length > MAX_DELETE_COUNT) {
      toast.error(
        `Select ${MAX_DELETE_COUNT} or fewer attachments before deleting.`,
      );
      return;
    }

    if (
      !window.confirm(
        `Delete ${selectedIds.length} attachment${selectedIds.length === 1 ? "" : "s"}? This also removes cached derivatives.`,
      )
    ) {
      return;
    }

    setDeleting(true);
    try {
      const result = await deleteAttachments({
        data: { attachmentIds: selectedIds },
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
            data={pagedAttachments}
            loading={
              attachments.status === "LoadingFirstPage" ||
              (attachments.status === "LoadingMore" &&
                pagedAttachments.length === 0)
            }
            emptyMessage="No attachments found."
            emptyIcon={FileText}
            multiselect
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getRowId={getAttachmentId}
            enableRowSelection={enableRowSelection}
            pagination={{
              page,
              pageSize,
              totalCount: attachments.results.length,
              totalPages: loadedPages,
              hasNextPage,
              hasPreviousPage: page > 1,
              onPageChange: handlePageChange,
              onPageSizeChange: (next) => {
                setPage(1);
                setPageSize(next);
              },
              pageSizeOptions: PAGE_SIZE_OPTIONS,
              unknownTotal: true,
            }}
          />

          {selectedCount > loadedSelectedCount ? (
            <p className="text-muted-foreground text-xs">
              {selectedCount - loadedSelectedCount} selected attachment
              {selectedCount - loadedSelectedCount === 1 ? "" : "s"} are on
              other loaded pages.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
