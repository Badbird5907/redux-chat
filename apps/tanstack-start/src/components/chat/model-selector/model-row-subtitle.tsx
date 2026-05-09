import type { PlanTier } from "@redux/shared";
import type { ChatModelConfig } from "@redux/shared/models";
import {
  calculateDisplayMultiplier,
  getRoundedMultiplierLabel,
} from "@redux/shared";
import { Badge } from "@redux/ui/components/badge";
import { useTheme } from "@redux/ui/components/theme";
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
}: {
  model: ChatModelConfig;
  tier: PlanTier;
}) {
  const { resolvedTheme } = useTheme();
  const entry = providerLogoEntry(model.maker);
  const Cmp = resolvedTheme === "dark" ? entry?.LogoWhite : entry?.Logo;
  const displayMultiplier = calculateDisplayMultiplier(
    model.defaultProviderId,
    tier,
  );
  const multiplierLabel = getRoundedMultiplierLabel(displayMultiplier);
  return (
    <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px] leading-none">
      {Cmp ? <Cmp className="size-3 shrink-0 opacity-90" aria-hidden /> : null}
      <span className="truncate">{model.makerName}</span>
      <Badge
        variant="outline"
        className={cn(
          "text-[10px] leading-none tracking-wide uppercase",
          displayMultiplierBadgeClassName(displayMultiplier),
        )}
      >
        {multiplierLabel}
      </Badge>
    </div>
  );
}
