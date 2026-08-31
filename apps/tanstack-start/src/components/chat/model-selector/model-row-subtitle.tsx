import { Info } from "lucide-react";

import type { PlanTier } from "@redux/shared";
import type {
  ByokProviderId,
  ChatModelConfig,
  UserModelRoutingConfig,
} from "@redux/shared/models";
import {
  calculateDisplayMultiplier,
  getRoundedMultiplierLabel,
} from "@redux/shared";
import {
  getModelDisplayName,
  resolveEffectiveModelRoute,
} from "@redux/shared/models";
import { Badge } from "@redux/ui/components/badge";
import { useTheme } from "@redux/ui/components/theme";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
import { cn } from "@redux/ui/lib/utils";

import {
  getSharedProviderLogo,
  LOGO_REGISTRY,
} from "@/components/logos/registry";

function displayMultiplierBadgeClassName(band: number) {
  switch (band) {
    case 1:
      return "border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300";
    case 2:
      return "border-sky-500/35 bg-sky-500/10 text-sky-800 dark:text-sky-300";
    case 4:
      return "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300";
    case 8:
      return "border-orange-500/40 bg-orange-500/10 text-orange-900 dark:text-orange-300";
    case 16:
      return "border-rose-500/40 bg-rose-500/15 text-rose-900 dark:text-rose-300";
    default:
      return "";
  }
}

function providerLogoEntry(maker: string) {
  if (maker in LOGO_REGISTRY) {
    return LOGO_REGISTRY[maker as keyof typeof LOGO_REGISTRY];
  }
  return getSharedProviderLogo(maker);
}

export function ModelRowSubtitle({
  model,
  tier,
  routing,
  configuredProviders,
  byokEnabled,
}: {
  model: ChatModelConfig;
  tier: PlanTier;
  routing?: UserModelRoutingConfig;
  configuredProviders: ReadonlySet<ByokProviderId>;
  byokEnabled: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const entry = providerLogoEntry(model.maker);
  const Cmp = resolvedTheme === "dark" ? entry?.LogoWhite : entry?.Logo;
  const displayMultiplier = calculateDisplayMultiplier(
    model.defaultProviderId,
    tier,
  );
  const multiplierLabel = getRoundedMultiplierLabel(displayMultiplier);
  const effectiveRoute = resolveEffectiveModelRoute({
    modelId: model.id,
    config: routing,
    availableProviders: configuredProviders,
    byokEnabled,
  });
  const isByok = effectiveRoute?.fundingSource === "user";
  return (
    <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px] leading-none">
      {Cmp ? <Cmp className="size-3 shrink-0 opacity-90" aria-hidden /> : null}
      <span className="truncate">{model.makerName}</span>
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] leading-none tracking-wide uppercase",
          isByok
            ? "border-violet-500/35 bg-violet-500/10 text-violet-800 dark:text-violet-300"
            : displayMultiplierBadgeClassName(displayMultiplier),
        )}
      >
        {isByok ? "BYOK" : multiplierLabel}
      </Badge>
      {effectiveRoute ? (
        <Tooltip delay={250}>
          <TooltipTrigger
            render={(props) => (
              <button
                type="button"
                {...props}
                className={cn(
                  "text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2",
                  props.className,
                )}
                aria-label={`Routing information for ${getModelDisplayName(model.id)}`}
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <Info className="size-3" aria-hidden />
              </button>
            )}
          />
          <TooltipContent className="space-y-1.5 py-2" side="top">
            <p className="font-semibold">{effectiveRoute.route.providerName}</p>
            <p>
              {isByok ? "Your API key (BYOK)" : "Redux Chat hosted (credits)"}
            </p>
            <p className="text-muted-foreground capitalize">
              {effectiveRoute.reason === "priority"
                ? "Automatic priority"
                : effectiveRoute.reason}
            </p>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
