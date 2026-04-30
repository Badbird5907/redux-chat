import type { LucideIcon } from "lucide-react";
import { Brain, FileScan, ImageIcon, Wrench } from "lucide-react";

import type { ChatModelConfig } from "@redux/shared/models";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@redux/ui/components/tooltip";
import { cn } from "@redux/ui/lib/utils";

export type CapabilityId = "image" | "pdf" | "reasoning" | "toolCalling";

export const CAPABILITY_CHIP_WRAPPER_CLASSES =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors";

interface CapabilityDef {
  id: CapabilityId;
  label: string;
  Icon: LucideIcon;
  test: (model: ChatModelConfig) => boolean;
  chipClassName: string;
  showInOverview?: boolean;
}

export const CAPABILITY_DEFS = [
  {
    id: "image",
    label: "Vision",
    Icon: ImageIcon,
    test: (m: ChatModelConfig) => m.modalities.input.includes("image"),
    chipClassName:
      "border-sky-500/25 bg-sky-500/[0.1] text-sky-700 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)] hover:bg-sky-500/[0.18] hover:text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-300 dark:shadow-none dark:hover:bg-sky-400/[0.18] dark:hover:text-sky-200",
    showInOverview: true,
  },
  {
    id: "pdf",
    label: "PDF Comprehension",
    Icon: FileScan,
    test: (m: ChatModelConfig) => m.modalities.input.includes("pdf"),
    chipClassName:
      "border-rose-500/25 bg-rose-500/[0.1] text-rose-800 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)] hover:bg-rose-500/[0.18] hover:text-rose-950 dark:border-rose-400/25 dark:bg-rose-400/10 dark:text-rose-300 dark:shadow-none dark:hover:bg-rose-400/[0.18] dark:hover:text-rose-200",
    showInOverview: true,
  },
  {
    id: "reasoning",
    label: "Reasoning",
    Icon: Brain,
    test: (m: ChatModelConfig) => m.supports.reasoning,
    chipClassName:
      "border-violet-500/25 bg-violet-500/[0.1] text-violet-700 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)] hover:bg-violet-500/[0.18] hover:text-violet-900 dark:border-violet-400/25 dark:bg-violet-400/10 dark:text-violet-300 dark:shadow-none dark:hover:bg-violet-400/[0.18] dark:hover:text-violet-200",
    showInOverview: true,
  },
  {
    id: "toolCalling",
    label: "Tool calling",
    Icon: Wrench,
    test: (m: ChatModelConfig) => m.supports.toolCalling,
    chipClassName:
      "border-emerald-500/25 bg-emerald-500/[0.1] text-emerald-800 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)] hover:bg-emerald-500/[0.18] hover:text-emerald-950 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:shadow-none dark:hover:bg-emerald-400/[0.18] dark:hover:text-emerald-200",
  },
] satisfies readonly CapabilityDef[];

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
      role="group"
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
