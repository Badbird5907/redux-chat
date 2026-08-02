import { KeyRound } from "lucide-react";

import type { ByokProviderId } from "@redux/shared/models";
import { cn } from "@redux/ui/lib/utils";

import { ProviderGlyph } from "@/components/chat/model-selector/provider-glyph";
import { PROVIDERS } from "./provider-config";

export function ByokProviderIcon({
  provider,
  className,
}: {
  provider: ByokProviderId;
  className?: string;
}) {
  const metadata = PROVIDERS[provider];
  const FallbackIcon = metadata.icon ?? KeyRound;
  return (
    <span
      className={cn(
        "bg-muted/50 border-border/60 flex size-9 shrink-0 items-center justify-center rounded-lg border",
        className,
      )}
    >
      {metadata.logoMaker ? (
        <ProviderGlyph maker={metadata.logoMaker} className="size-4.5" />
      ) : (
        <FallbackIcon className="text-muted-foreground size-4.5" aria-hidden />
      )}
    </span>
  );
}
