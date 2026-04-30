import { useTheme } from "@redux/ui/components/theme";
import { cn } from "@redux/ui/lib/utils";

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

export function ProviderGlyph({
  maker,
  className,
}: {
  maker: string;
  className?: string;
}) {
  const { resolvedTheme } = useTheme();
  const entry = providerLogoEntry(maker);
  const Cmp = resolvedTheme === "dark" ? entry?.LogoWhite : entry?.Logo;
  if (!Cmp) return null;
  return <Cmp className={cn("size-5", className)} aria-hidden />;
}
