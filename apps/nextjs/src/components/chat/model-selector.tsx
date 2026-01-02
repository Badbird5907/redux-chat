"use client"

/**
 * ModelSelector Component
 *
 * This is a standalone, easily replaceable component for model selection.
 * To replace it:
 * 1. Create your own component with the same props interface
 * 2. Import your component instead of this one
 * 3. Ensure it maintains the selectedModel and onModelChange props
 */

import { Check, ChevronDown } from "lucide-react"
import { Button } from "@redux/ui/components/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@redux/ui/components/dropdown-menu"
import type { ModelConfig } from "@/lib/model-config"

interface ModelSelectorProps {
  models: ModelConfig[]
  selectedModel: string
  onModelChange: (modelId: string) => void
}

export function ModelSelector({ models, selectedModel, onModelChange }: ModelSelectorProps) {
  const currentModel = models.find((m) => m.id === selectedModel) ?? models[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md gap-1"
        >
          <span className="font-medium">{currentModel?.name}</span>
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        {models.map((model) => (
          <DropdownMenuItem
            key={model.id}
            onClick={() => onModelChange(model.id)}
            className="flex items-start gap-2 cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">{model.name}</div>
              <div className="text-xs text-muted-foreground">{model.provider}</div>
            </div>
            {model.id === selectedModel && <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
