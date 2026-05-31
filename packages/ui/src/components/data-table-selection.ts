import type { OnChangeFn, Row, RowSelectionState } from "@tanstack/react-table";
import * as React from "react";

export function getRowSelectionSelectedIds(
  rowSelection: RowSelectionState,
): string[] {
  return Object.entries(rowSelection).flatMap(([id, selected]) =>
    selected ? [id] : [],
  );
}

export function getRowsForRowSelection<TData>(
  data: TData[],
  rowSelection: RowSelectionState,
  getRowId: (row: TData) => string,
): TData[] {
  const selected = new Set(getRowSelectionSelectedIds(rowSelection));
  return data.filter((row) => selected.has(getRowId(row)));
}

export function useDataTableMultiselect<TData>(
  getRowId: (row: TData) => string,
): {
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
