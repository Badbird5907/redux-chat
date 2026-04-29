import { Check, ChevronDown } from "lucide-react";

import type { ChatModelConfig } from "@redux/shared/models";
import { Button } from "@redux/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@redux/ui/components/dropdown-menu";

interface ModelSelectorProps {
  models: ChatModelConfig[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
}

export function ModelSelector({
  models,
  selectedModel,
  onModelChange,
}: ModelSelectorProps) {
  const currentModel = models.find((m) => m.id === selectedModel) ?? models[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground hover:bg-muted h-7 gap-1 rounded-md px-2 text-xs"
          />
        }
      >
        <span className="font-medium">{currentModel?.name}</span>
        <ChevronDown className="h-3 w-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelChange(model.id)}
            className="flex cursor-pointer items-start gap-2"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{model.name}</div>
              <div className="text-muted-foreground text-xs">
                {model.provider}
              </div>
            </div>
            {model.id === selectedModel && (
              <Check className="text-primary mt-0.5 h-4 w-4 flex-shrink-0" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
