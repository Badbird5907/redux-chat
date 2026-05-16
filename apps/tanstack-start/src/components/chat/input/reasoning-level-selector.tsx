import { ChevronDown } from "lucide-react";

import type { ThinkingLevel } from "@redux/shared/models";
import { Button } from "@redux/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";

import {
  THINKING_LEVEL_ICONS,
  THINKING_LEVEL_LABELS,
} from "../thinking-level-display";

interface ReasoningLevelSelectorProps {
  thinkingLevel: ThinkingLevel;
  thinkingLevels: readonly ThinkingLevel[];
  onThinkingLevelChange: (level: ThinkingLevel) => void;
}

const triggerButtonClassName =
  "text-muted-foreground hover:text-foreground hover:bg-muted h-7 gap-1.5 rounded-md px-2 text-xs";

export function ReasoningLevelSelector({
  thinkingLevel,
  thinkingLevels,
  onThinkingLevelChange,
}: ReasoningLevelSelectorProps) {
  const TriggerIcon = THINKING_LEVEL_ICONS[thinkingLevel];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={triggerButtonClassName}
          />
        }
      >
        <TriggerIcon className="size-3.5" />
        <span className="font-medium">
          {THINKING_LEVEL_LABELS[thinkingLevel]}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" sideOffset={8}>
        <DropdownMenuRadioGroup
          value={thinkingLevel}
          onValueChange={(value) =>
            onThinkingLevelChange(value as ThinkingLevel)
          }
        >
          {thinkingLevels.map((level) => {
            const LevelIcon = THINKING_LEVEL_ICONS[level];
            return (
              <DropdownMenuRadioItem key={level} value={level}>
                <LevelIcon className="size-4 shrink-0" />
                {THINKING_LEVEL_LABELS[level]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
