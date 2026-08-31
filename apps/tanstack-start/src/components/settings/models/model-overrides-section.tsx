import { useCallback, useMemo, useState } from "react";
import { Boxes } from "lucide-react";

import type {
  ByokProviderId,
  ChatModelConfig,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import type { ColumnDef } from "@redux/ui/components/data-table";
import {
  CHAT_MODELS,
  getModelRoutes,
  isByokProviderId,
  resolveEffectiveModelRoute,
} from "@redux/shared/models";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { DataTable } from "@redux/ui/components/data-table";
import { Input } from "@redux/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";

import { ProviderGlyph } from "@/components/chat/model-selector/provider-glyph";
import { UpgradeLockBadge } from "./upgrade-lock-badge";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 10;

export function ModelOverridesSection({
  routing,
  configuredProviders,
  routingSaving,
  byokEnabled,
  disabled,
  onSaveRouting,
}: {
  routing: UserModelRoutingConfig;
  configuredProviders: ReadonlySet<ByokProviderId>;
  routingSaving: boolean;
  byokEnabled: boolean;
  disabled: boolean;
  onSaveRouting: (next: UserModelRoutingConfig) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [overriddenOnly, setOverriddenOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const overrideByModelId = useMemo(
    () =>
      new Map(
        routing.overrides.map((override) => [override.modelId, override]),
      ),
    [routing.overrides],
  );

  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return CHAT_MODELS.filter((model) => {
      if (overriddenOnly && !overrideByModelId.has(model.id)) return false;
      return (
        !query ||
        `${model.name} ${model.makerName}`.toLowerCase().includes(query)
      );
    });
  }, [search, overriddenOnly, overrideByModelId]);

  const totalPages = Math.max(1, Math.ceil(filteredModels.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedModels = useMemo(
    () =>
      filteredModels.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      ),
    [filteredModels, currentPage, pageSize],
  );

  const setOverride = useCallback(
    (modelId: string, value: string) => {
      const overrides = routing.overrides.filter(
        (override) => override.modelId !== modelId,
      );
      if (value === "hosted") {
        overrides.push({ modelId, kind: "hosted" });
      } else if (value !== "auto") {
        overrides.push({
          modelId,
          kind: "byok",
          routeId: value,
        });
      }
      void onSaveRouting({ ...routing, overrides });
    },
    [routing, onSaveRouting],
  );

  const columns = useMemo<ColumnDef<ChatModelConfig>[]>(
    () => [
      {
        id: "model",
        header: "Model",
        meta: { cellClassName: "py-2.5" },
        cell: ({ row }) => {
          const model = row.original;
          return (
            <div className="flex min-w-0 items-center gap-2.5">
              <ProviderGlyph
                maker={model.maker}
                className="size-4.5 shrink-0"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{model.name}</p>
                <p className="text-muted-foreground truncate text-xs">
                  {model.makerName}
                </p>
              </div>
            </div>
          );
        },
      },
      {
        id: "route",
        header: "Current route",
        meta: {
          headerClassName: "hidden md:table-cell",
          cellClassName: "hidden md:table-cell py-2.5",
        },
        cell: ({ row }) => {
          const effective = resolveEffectiveModelRoute({
            modelId: row.original.id,
            config: routing,
            availableProviders: configuredProviders,
            byokEnabled,
          });
          if (!effective) {
            return (
              <span className="text-muted-foreground text-xs">
                No available route
              </span>
            );
          }
          return (
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-xs">
                {effective.route.providerName}
              </span>
              <Badge
                variant="outline"
                color={effective.fundingSource === "user" ? "green" : "muted"}
              >
                {effective.fundingSource === "user" ? "BYOK" : "Credits"}
              </Badge>
            </div>
          );
        },
      },
      {
        id: "override",
        header: "Route via",
        meta: {
          headerClassName: "md:w-64",
          cellClassName: "py-2.5",
        },
        cell: ({ row }) => {
          const model = row.original;
          const override = overrideByModelId.get(model.id);
          const value =
            override?.kind === "hosted"
              ? "hosted"
              : override?.kind === "byok"
                ? override.routeId
                : "auto";
          const routes = getModelRoutes(model.id).filter(
            (route) =>
              isByokProviderId(route.provider) &&
              configuredProviders.has(route.provider),
          );
          return (
            <Select
              value={value}
              disabled={disabled || routingSaving}
              onValueChange={(next) => setOverride(model.id, next)}
            >
              <SelectTrigger className="w-full md:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                {routes.map((route) => (
                  <SelectItem key={route.id} value={route.id}>
                    {route.providerName} · BYOK
                  </SelectItem>
                ))}
                <SelectItem value="hosted">
                  Redux Chat hosted · credits
                </SelectItem>
              </SelectContent>
            </Select>
          );
        },
      },
    ],
    [
      routing,
      overrideByModelId,
      configuredProviders,
      byokEnabled,
      disabled,
      routingSaving,
      setOverride,
    ],
  );

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Per-model overrides</h2>
            {disabled ? <UpgradeLockBadge /> : null}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Auto follows the priority above. Stale catalog routes are removed
            automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={overriddenOnly ? "default" : "outline"}
            aria-pressed={overriddenOnly}
            onClick={() => {
              setOverriddenOnly((current) => !current);
              setPage(1);
            }}
          >
            Overridden
            {routing.overrides.length > 0
              ? ` (${routing.overrides.length})`
              : ""}
          </Button>
          <Input
            className="sm:w-64"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search models"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={pagedModels}
        emptyMessage={
          overriddenOnly
            ? "No per-model overrides yet."
            : "No models match your search."
        }
        emptyIcon={Boxes}
        pagination={{
          page: currentPage,
          pageSize,
          totalCount: filteredModels.length,
          totalPages,
          hasNextPage: currentPage < totalPages,
          hasPreviousPage: currentPage > 1,
          onPageChange: setPage,
          onPageSizeChange: (next) => {
            setPage(1);
            setPageSize(next);
          },
          pageSizeOptions: PAGE_SIZE_OPTIONS,
        }}
      />
    </section>
  );
}
