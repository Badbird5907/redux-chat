import type { ChatModelConfig } from "@redux/shared/models";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
import { cn } from "@redux/ui/lib/utils";

import {
  CAPABILITY_CHIP_WRAPPER_CLASSES,
  CAPABILITY_DEFS,
} from "./capabilities-data";

const groupRole = "group" as const;

export function Capabilities({ model }: { model: ChatModelConfig }) {
  const items = CAPABILITY_DEFS.filter(
    (d) => d.showInOverview && d.test(model),
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className="flex max-w-31 flex-wrap justify-end gap-1"
      role={groupRole}
      aria-label="Model capabilities"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {items.map(({ id, label, Icon, chipClassName }) => (
        <Tooltip key={id} delay={300}>
          <TooltipTrigger
            render={(props) => (
              <button
                type="button"
                {...props}
                tabIndex={-1}
                aria-label={label}
                className={cn(
                  CAPABILITY_CHIP_WRAPPER_CLASSES,
                  chipClassName,
                  props.className,
                )}
              >
                <Icon className="size-3.5" strokeWidth={2} aria-hidden />
              </button>
            )}
          />
          <TooltipContent side="top" sideOffset={6} className="font-medium">
            {label}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
