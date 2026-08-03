import { useState } from "react";

import type {
  ByokRouteAvailability,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import {
  CHAT_MODELS,
  getModelRoutes,
  isByokProviderId,
  isByokRouteAvailable,
  resolveEffectiveModelRoute,
} from "@redux/shared/models";
import { Input } from "@redux/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@redux/ui/components/select";

export function ModelOverridesSection({
  routing,
  availability,
  routingSaving,
  onSaveRouting,
}: {
  routing: UserModelRoutingConfig;
  availability: ByokRouteAvailability;
  routingSaving: boolean;
  onSaveRouting: (next: UserModelRoutingConfig) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const visibleModels = CHAT_MODELS.filter((model) => {
    const query = search.trim().toLowerCase();
    return (
      !query || `${model.name} ${model.makerName}`.toLowerCase().includes(query)
    );
  });

  const setOverride = (modelId: string, value: string) => {
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
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold">Per-model overrides</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Auto follows the priority above. Stale catalog routes are removed
            automatically.
          </p>
        </div>
        <Input
          className="sm:w-72"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search models"
        />
      </div>
      <div className="divide-border/60 divide-y overflow-hidden rounded-lg border">
        {visibleModels.map((model) => {
          const override = routing.overrides.find(
            (item) => item.modelId === model.id,
          );
          const effective = resolveEffectiveModelRoute({
            modelId: model.id,
            config: routing,
            availability,
            byokEnabled: true,
          });
          const value =
            override?.kind === "hosted"
              ? "hosted"
              : override?.kind === "byok"
                ? override.routeId
                : "auto";
          const routes = getModelRoutes(model.id).filter(
            (route) =>
              isByokProviderId(route.provider) &&
              isByokRouteAvailable(route, availability),
          );
          return (
            <div
              key={model.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{model.name}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {effective
                    ? `${effective.route.providerName} · ${effective.fundingSource === "user" ? "BYOK" : "Redux Chat credits"}`
                    : "No available route"}
                </p>
              </div>
              <Select
                value={value}
                disabled={routingSaving}
                onValueChange={(next) => setOverride(model.id, next)}
              >
                <SelectTrigger className="w-full sm:w-64">
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
            </div>
          );
        })}
      </div>
    </section>
  );
}
