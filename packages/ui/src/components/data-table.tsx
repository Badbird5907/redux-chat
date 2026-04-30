"use client";

import type {
  CellContext,
  ColumnDef,
  OnChangeFn,
  Row,
  RowSelectionState,
} from "@tanstack/react-table";
import type { LucideIcon } from "lucide-react";
import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileX,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";
import { cn } from "@redux/ui/lib/utils";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import Spinner from "./spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

// https://github.com/TanStack/table/discussions/3068#discussioncomment-12041689
function getRowRange<TData>(
  rows: Row<TData>[],
  clickedRowID: string,
  previousClickedRowID: string,
) {
  const range: Row<TData>[] = [];
  const processedRowsMap: Record<string, boolean> = {
    [clickedRowID]: false,
    [previousClickedRowID]: false,
  };
  for (const row of rows) {
    if (row.id === clickedRowID || row.id === previousClickedRowID) {
      if (previousClickedRowID === "") {
        range.push(row);
        break;
      }

      processedRowsMap[row.id] = true;
    }
    if (
      (processedRowsMap[clickedRowID] ||
        processedRowsMap[previousClickedRowID]) &&
      !row.getIsGrouped()
    ) {
      range.push(row);
    }
    if (
      processedRowsMap[clickedRowID] &&
      processedRowsMap[previousClickedRowID]
    ) {
      break;
    }
  }

  return range;
}

function shiftCheckboxClickHandler<TData>(
  event: React.MouseEvent<HTMLElement>,
  context: CellContext<TData, unknown>,
  previousClickedRowID: string,
) {
  if (event.shiftKey) {
    const { rows, rowsById: rowsMap } = context.table.getRowModel();
    const rowsToToggle = getRowRange(
      rows,
      context.row.id,
      rows.map((r) => r.id).includes(previousClickedRowID)
        ? previousClickedRowID
        : "",
    );
    const isLastSelected = !rowsMap[context.row.id]?.getIsSelected();
    rowsToToggle.forEach((row) => row.toggleSelected(isLastSelected));
  }
}

function getRowSelectionSelectedIds(rowSelection: RowSelectionState): string[] {
  return Object.entries(rowSelection)
    .filter(([, selected]) => selected)
    .map(([id]) => id);
}

function getRowsForRowSelection<TData>(
  data: TData[],
  rowSelection: RowSelectionState,
  getRowId: (row: TData) => string,
): TData[] {
  const selected = new Set(getRowSelectionSelectedIds(rowSelection));
  return data.filter((row) => selected.has(getRowId(row)));
}

function useDataTableMultiselect<TData>(getRowId: (row: TData) => string): {
  rowSelection: RowSelectionState;
  onRowSelectionChange: OnChangeFn<RowSelectionState>;
  getRowId: (originalRow: TData, index: number, parent?: Row<TData>) => string;
  getSelectedRows: (data: TData[]) => TData[];
  selectedIds: string[];
} {
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const getRowIdForTable = React.useCallback(
    (originalRow: TData, _index: number, _parent?: Row<TData>) =>
      getRowId(originalRow),
    [getRowId],
  );
  const getSelectedRows = React.useCallback(
    (data: TData[]) => getRowsForRowSelection(data, rowSelection, getRowId),
    [rowSelection, getRowId],
  );
  const selectedIds = React.useMemo(
    () => getRowSelectionSelectedIds(rowSelection),
    [rowSelection],
  );

  return {
    rowSelection,
    onRowSelectionChange: setRowSelection,
    getRowId: getRowIdForTable,
    getSelectedRows,
    selectedIds,
  };
}

interface DataTablePaginationState {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

interface DataTablePaginationProps extends DataTablePaginationState {
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
}

function DataTablePagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  hasNextPage,
  hasPreviousPage,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: DataTablePaginationProps) {
  if (totalCount <= 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:contents">
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <span>Rows:</span>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={size.toString()}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="text-muted-foreground text-sm tabular-nums">
          {page} / {totalPages} ({totalCount.toLocaleString()})
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 sm:justify-end sm:gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(1)}
          disabled={!hasPreviousPage}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={!hasPreviousPage}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!hasNextPage}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(totalPages)}
          disabled={!hasNextPage}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: LucideIcon;
  onRowClick?: (row: TData) => void;
  onRowMiddleClick?: (
    row: TData,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => void;
  pagination?: DataTablePaginationProps | null;
  multiselect?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string;
} & (
  | { multiselect?: false | undefined }
  | {
      multiselect: true;
      getRowId: (
        originalRow: TData,
        index: number,
        parent?: Row<TData>,
      ) => string;
    }
);

function getColumnLayoutMeta(meta: unknown): {
  headerClassName?: string;
  cellClassName?: string;
} {
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    return {
      headerClassName:
        typeof m.headerClassName === "string" ? m.headerClassName : undefined,
      cellClassName:
        typeof m.cellClassName === "string" ? m.cellClassName : undefined,
    };
  }
  return {};
}

function DataTable<TData, TValue>({
  columns,
  data,
  loading = false,
  emptyMessage = "No results.",
  emptyIcon: EmptyIcon = FileX,
  onRowClick,
  onRowMiddleClick,
  pagination,
  multiselect = false,
  rowSelection,
  onRowSelectionChange,
  getRowId,
}: DataTableProps<TData, TValue>) {
  const previousSelectedRowIdRef = React.useRef("");
  const skipNextCheckboxChangeRef = React.useRef(false);

  const [uncontrolledSelection, setUncontrolledSelection] =
    React.useState<RowSelectionState>({});
  const usingUncontrolledMultiselect =
    multiselect && onRowSelectionChange === undefined;
  const effectiveRowSelection = usingUncontrolledMultiselect
    ? uncontrolledSelection
    : (rowSelection ?? {});
  const effectiveOnRowSelectionChange = usingUncontrolledMultiselect
    ? setUncontrolledSelection
    : onRowSelectionChange;

  const selectionEnabled = multiselect || effectiveOnRowSelectionChange != null;

  const selectionColumn = React.useMemo(
    (): ColumnDef<TData, unknown> => ({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() &&
            !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: (context) => {
        const { row } = context;
        const handleSelectionCellClick = (
          event: React.MouseEvent<HTMLDivElement>,
        ) => {
          event.stopPropagation();
          if (event.shiftKey) {
            event.preventDefault();
            skipNextCheckboxChangeRef.current = true;
            shiftCheckboxClickHandler(
              event,
              context,
              previousSelectedRowIdRef.current,
            );
            previousSelectedRowIdRef.current = context.row.id;
            return;
          }
          row.toggleSelected(!row.getIsSelected());
          previousSelectedRowIdRef.current = context.row.id;
        };

        return (
          // -m-2 p-2: extend hit target over TableCell padding so row onClick does not fire on near-misses.
          <div
            className="-m-2 flex min-h-10 cursor-pointer items-center justify-center p-2"
            onMouseDown={(e) => {
              if (e.shiftKey) e.preventDefault();
            }}
            onClick={handleSelectionCellClick}
          >
            <Checkbox
              checked={row.getIsSelected()}
              onClick={(event) => {
                event.stopPropagation();
                if (event.shiftKey) {
                  event.preventDefault();
                  skipNextCheckboxChangeRef.current = true;
                  shiftCheckboxClickHandler(
                    event,
                    context,
                    previousSelectedRowIdRef.current,
                  );
                }
                previousSelectedRowIdRef.current = context.row.id;
              }}
              onCheckedChange={(value) => {
                if (skipNextCheckboxChangeRef.current) {
                  skipNextCheckboxChangeRef.current = false;
                  return;
                }
                row.toggleSelected(!!value);
                previousSelectedRowIdRef.current = context.row.id;
              }}
              aria-label="Select row"
            />
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false,
    }),
    [],
  );

  const displayColumns = React.useMemo(() => {
    if (!multiselect) {
      return columns;
    }
    return [selectionColumn, ...columns] as ColumnDef<TData, TValue>[];
  }, [multiselect, selectionColumn, columns]);

  const columnCount = displayColumns.length;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table requires this hook to create table instance for rendering.
  const table = useReactTable({
    data,
    columns: displayColumns,
    getCoreRowModel: getCoreRowModel(),
    ...(selectionEnabled
      ? {
          enableRowSelection: true,
          ...(getRowId ? { getRowId } : {}),
          onRowSelectionChange: effectiveOnRowSelectionChange,
          state: { rowSelection: effectiveRowSelection },
        }
      : {}),
  });

  const handleRowClick = (row: Row<TData>) => {
    if (onRowClick) {
      onRowClick(row.original);
    }
  };

  const handleRowAuxClick = (
    row: Row<TData>,
    event: React.MouseEvent<HTMLTableRowElement>,
  ) => {
    if (event.button !== 1 || !onRowMiddleClick) {
      return;
    }
    onRowMiddleClick(row.original, event);
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const { headerClassName } = getColumnLayoutMeta(
                  header.column.columnDef.meta,
                );
                return (
                  <TableHead key={header.id} className={headerClassName}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-48">
                <div className="flex flex-col items-center justify-center gap-2">
                  <Spinner className="size-8" />
                  <span className="text-muted-foreground text-sm">
                    Loading...
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
                onClick={() => handleRowClick(row)}
                onAuxClick={(e) => handleRowAuxClick(row, e)}
                onMouseDownCapture={
                  multiselect
                    ? (e) => {
                        if (e.shiftKey) e.preventDefault();
                      }
                    : undefined
                }
                className={cn(
                  (onRowClick ?? onRowMiddleClick) && "cursor-pointer",
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const { cellClassName } = getColumnLayoutMeta(
                    cell.column.columnDef.meta,
                  );
                  return (
                    <TableCell key={cell.id} className={cellClassName}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="h-48">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="bg-muted flex size-12 items-center justify-center rounded-full">
                    <EmptyIcon className="text-muted-foreground size-6" />
                  </div>
                  <span className="text-muted-foreground text-sm">
                    {emptyMessage}
                  </span>
                </div>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {pagination != null && pagination.totalCount > 0 ? (
        <div className="bg-background border-t px-4 py-4">
          <DataTablePagination {...pagination} />
        </div>
      ) : null}
    </div>
  );
}

export {
  DataTable,
  DataTablePagination,
  getRowSelectionSelectedIds,
  getRowsForRowSelection,
  useDataTableMultiselect,
};
export type {
  CellContext,
  ColumnDef,
  Row,
  RowSelectionState,
} from "@tanstack/react-table";
export type { DataTablePaginationProps, DataTablePaginationState };
export type { DataTableProps };
