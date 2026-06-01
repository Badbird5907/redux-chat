import { Upload } from "lucide-react";

export function ChatFileDropHighlightOverlay() {
  return (
    <div
      className="bg-background/55 animate-in fade-in pointer-events-none fixed inset-0 z-100 flex items-center justify-center backdrop-blur-sm duration-200"
      aria-hidden
    >
      <div className="border-primary/70 bg-card/95 text-foreground flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-12 py-10 text-center shadow-xl">
        <Upload
          className="text-primary size-12"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-lg font-medium">Drop files to attach</p>
        <p className="text-muted-foreground text-sm">
          Release to add them to your message
        </p>
      </div>
    </div>
  );
}
