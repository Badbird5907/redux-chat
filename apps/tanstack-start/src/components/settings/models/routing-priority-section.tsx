import { ArrowDown, ArrowUp } from "lucide-react";

import type {
  ByokProviderId,
  RoutingPreset,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import { providerPriorityForPreset } from "@redux/shared/models";
import { Badge } from "@redux/ui/components/badge";
import { Button } from "@redux/ui/components/button";
import { Card } from "@redux/ui/components/card";
import { Switch } from "@redux/ui/components/switch";

import { PROVIDERS } from "./provider-config";

export function RoutingPrioritySection({
  routing,
  configuredProviders,
  routingSaving,
  onSaveRouting,
}: {
  routing: UserModelRoutingConfig;
  configuredProviders: ReadonlySet<ByokProviderId>;
  routingSaving: boolean;
  onSaveRouting: (next: UserModelRoutingConfig) => Promise<void>;
}) {
  const applyPreset = (preset: Exclude<RoutingPreset, "custom">) => {
    void onSaveRouting({
      ...routing,
      preset,
      providerPriority: providerPriorityForPreset(preset),
    });
  };

  const moveProvider = (provider: ByokProviderId, delta: -1 | 1) => {
    const priority = [...routing.providerPriority];
    const index = priority.indexOf(provider);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= priority.length) return;
    const current = priority[index];
    const destination = priority[target];
    if (!current || !destination) return;
    priority[index] = destination;
    priority[target] = current;
    void onSaveRouting({
      ...routing,
      preset: "custom",
      providerPriority: priority,
    });
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Routing priority</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          The first configured provider that supports a model is used.
        </p>
      </div>
      <Card className="gap-4 px-5 py-5">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={routingSaving}
            variant={routing.preset === "native_first" ? "default" : "outline"}
            onClick={() => applyPreset("native_first")}
          >
            Native first
          </Button>
          <Button
            size="sm"
            disabled={routingSaving}
            variant={
              routing.preset === "openrouter_first" ? "default" : "outline"
            }
            onClick={() => applyPreset("openrouter_first")}
          >
            OpenRouter first
          </Button>
        </div>
        <div className="divide-border/60 divide-y rounded-lg border">
          {routing.providerPriority.map((provider, index) => (
            <div key={provider} className="flex items-center gap-3 px-3 py-2.5">
              <span className="text-muted-foreground w-5 text-center text-xs tabular-nums">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-sm font-medium">
                {PROVIDERS[provider].label}
              </span>
              <Badge variant="outline">
                {configuredProviders.has(provider)
                  ? "Configured"
                  : "No connection"}
              </Badge>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${PROVIDERS[provider].label} up`}
                disabled={routingSaving || index === 0}
                onClick={() => moveProvider(provider, -1)}
              >
                <ArrowUp />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${PROVIDERS[provider].label} down`}
                disabled={
                  routingSaving || index === routing.providerPriority.length - 1
                }
                onClick={() => moveProvider(provider, 1)}
              >
                <ArrowDown />
              </Button>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-4 border-t pt-4">
          <div>
            <p className="text-sm font-medium">Redux Chat hosted fallback</p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Use hosted provider credentials and credits when no BYOK route is
              available.
            </p>
          </div>
          <Switch
            checked={routing.hostedFallback}
            disabled={routingSaving}
            onCheckedChange={(checked) =>
              void onSaveRouting({ ...routing, hostedFallback: checked })
            }
            aria-label="Redux Chat hosted fallback"
          />
        </div>
      </Card>
    </section>
  );
}
