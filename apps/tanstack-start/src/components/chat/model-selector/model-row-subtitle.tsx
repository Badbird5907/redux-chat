import type { ChatModelConfig } from "@redux/shared/models";
import type { PlanTier } from "@redux/shared";
import {
  calculateDisplayMultiplier,
  getRoundedMultiplierLabel,
} from "@redux/shared";
import { Badge } from "@redux/ui/components/badge";
import { useTheme } from "@redux/ui/components/theme";

import {
  getSharedProviderLogo,
  LOGO_REGISTRY,
} from "@/components/logos/registry";

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
  const multiplierLabel = getRoundedMultiplierLabel(
    calculateDisplayMultiplier(model.defaultProviderId, tier),
  );
  return (
    <div className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-[11px] leading-none">
      {Cmp ? <Cmp className="size-3 shrink-0 opacity-90" aria-hidden /> : null}
      <span className="truncate">{model.makerName}</span>
      <Badge
        variant="outline"
        className="text-[10px] leading-none tracking-wide uppercase"
      >
        {multiplierLabel}
      </Badge>
    </div>
  );
}
