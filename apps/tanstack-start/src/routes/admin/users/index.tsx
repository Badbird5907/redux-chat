import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import type { ColumnDef } from "@redux/ui/components/data-table";
import { DataTable } from "@redux/ui/components/data-table";
import { Input } from "@redux/ui/components/input";
import { cn } from "@redux/ui/lib/utils";

import { authClient } from "@/lib/auth/client";

const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  banned?: boolean | null;
};

export const Route = createFileRoute("/admin/users/")({
  head: () => ({
    meta: [{ title: "Users | Admin | Redux Chat" }],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const navigate = useNavigate();
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const offset = (page - 1) * pageSize;

  const listQuery = useQuery({
    queryKey: ["admin", "users", "list", activeSearch, page, pageSize],
    queryFn: async () => {
      const res = await authClient.admin.listUsers({
        query: {
          limit: pageSize,
          offset,
          sortBy: "createdAt",
          sortDirection: "desc",
          ...(activeSearch
            ? {
                searchValue: activeSearch,
                searchField: "email" as const,
                searchOperator: "contains" as const,
              }
            : {}),
        },
      });
      if (res.error) {
        throw new Error(res.error.message);
      }
      return res.data;
    },
    placeholderData: keepPreviousData,
  });

  const users = (listQuery.data?.users ?? []) as AdminUser[];
  const total =
    typeof listQuery.data?.total === "number" ? listQuery.data.total : null;
  const errorMessage =
    listQuery.error instanceof Error ? listQuery.error.message : null;

  const totalPages = useMemo(() => {
    if (total == null) {
      return users.length === pageSize ? page + 1 : page;
    }
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, users.length, pageSize, page]);

  const runSearch = () => {
    setPage(1);
    setActiveSearch(searchInput.trim());
  };

  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.email}</span>
        ),
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name || "—"}</span>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <span className="text-muted-foreground text-xs">
            {row.original.role ?? "—"}
          </span>
        ),
      },
      {
        id: "status",
        header: () => <div className="text-right">Status</div>,
        cell: ({ row }) => (
          <div className="text-right">
            <span
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                row.original.banned
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {row.original.banned ? "Banned" : "Active"}
            </span>
          </div>
        ),
        meta: { headerClassName: "text-right" },
      },
    ],
    [],
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="text-foreground text-3xl font-semibold tracking-tight">
          Users
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          List, search, and inspect accounts
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <label
            className="text-muted-foreground text-xs font-medium"
            htmlFor="admin-user-search"
          >
            Search email
          </label>
          <Input
            id="admin-user-search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Filter by email contains…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                runSearch();
              }
            }}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={listQuery.isPending}
          onClick={runSearch}
        >
          Search
        </Button>
      </div>

      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        data={users}
        loading={listQuery.isPending}
        emptyMessage="No users match this filter."
        emptyIcon={Users}
        onRowClick={(row) =>
          void navigate({
            to: "/admin/users/$userId",
            params: { userId: row.id },
          })
        }
        pagination={{
          page,
          pageSize,
          totalCount: total ?? users.length + offset,
          totalPages,
          hasNextPage: page < totalPages,
          hasPreviousPage: page > 1,
          onPageChange: (next) => setPage(Math.max(1, next)),
          onPageSizeChange: (next) => {
            setPage(1);
            setPageSize(next);
          },
          pageSizeOptions: PAGE_SIZE_OPTIONS,
        }}
      />
    </div>
  );
}
