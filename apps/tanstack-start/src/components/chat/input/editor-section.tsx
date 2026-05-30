import type React from "react";
import type { RefObject } from "react";

import { cn } from "@redux/ui/lib/utils";

import { TokenVisualization } from "./token-visualization";

interface ChatInputEditorSectionProps {
  showTokenVisualization: boolean;
  isExpanded: boolean;
  input: string;
  setInput: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  visualizationRef: RefObject<HTMLButtonElement | null>;
  visualizationHeight: number | null;
  tokenizedText: string[];
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPasteFiles: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  draftReady: boolean;
  onCloseTokenVisualization: () => void;
}

export function ChatInputEditorSection({
  showTokenVisualization,
  isExpanded,
  input,
  setInput,
  textareaRef,
  visualizationRef,
  visualizationHeight,
  tokenizedText,
  onKeyDown,
  onPasteFiles,
  draftReady,
  onCloseTokenVisualization,
}: ChatInputEditorSectionProps) {
  return (
    <div
      className={cn(
        "px-4 pt-3 pb-2",
        isExpanded && "flex flex-1 flex-col overflow-hidden",
      )}
    >
      {showTokenVisualization ? (
        <TokenVisualization
          visualizationRef={visualizationRef}
          isExpanded={isExpanded}
          visualizationHeight={visualizationHeight}
          tokenizedText={tokenizedText}
          onClose={onCloseTokenVisualization}
        />
      ) : (
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPasteFiles}
          placeholder="Message..."
          aria-label="Message"
          rows={1}
          className={cn(
            "text-foreground placeholder:text-muted-foreground w-full resize-none bg-transparent text-base leading-6 focus:outline-none",
            isExpanded && "flex-1",
          )}
          style={isExpanded ? undefined : { maxHeight: `${24 * 10}px` }}
          disabled={!draftReady}
        />
      )}
    </div>
  );
}
