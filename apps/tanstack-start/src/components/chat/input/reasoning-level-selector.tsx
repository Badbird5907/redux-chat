import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { formatForDisplay } from "@tanstack/react-hotkeys";

import type { ThinkingLevel } from "@redux/shared/models";
import { Button } from "@redux/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";

import { requestFocusComposer } from "@/components/chat/focus-composer";
import type { ReasoningLevelSelectorRequestDetail } from "@/components/chat/open-reasoning-level-selector";
import { OPEN_REASONING_LEVEL_SELECTOR_EVENT } from "@/components/chat/open-reasoning-level-selector";
import { useResolvedHotkey } from "@/lib/hotkeys";
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
  const [open, setOpen] = useState(false);
  const reasoningLevelHotkey = useResolvedHotkey("reasoning.level.open");
  const handleOpenChange = (next: boolean) => {
    setOpen(next);

    if (!next) {
      requestFocusComposer();
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOpenRequest = (event: Event) => {
      const detail = (
        event as CustomEvent<ReasoningLevelSelectorRequestDetail | undefined>
      ).detail;

      if (detail?.toggle) {
        setOpen((current) => {
          if (current) {
            requestFocusComposer();
          }

          return !current;
        });
        return;
      }

      setOpen(detail?.open ?? true);
    };
    window.addEventListener(OPEN_REASONING_LEVEL_SELECTOR_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener(
        OPEN_REASONING_LEVEL_SELECTOR_EVENT,
        onOpenRequest,
      );
    };
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={triggerButtonClassName}
            title={`Open reasoning level (${formatForDisplay(reasoningLevelHotkey)})`}
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
          onValueChange={(value) => {
            onThinkingLevelChange(value as ThinkingLevel);
            setOpen(false);
            requestFocusComposer();
          }}
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
