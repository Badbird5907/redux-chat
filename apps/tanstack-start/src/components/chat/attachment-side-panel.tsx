"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import { cn } from "@redux/ui/lib/utils";

import { StaticMarkdown } from "@/components/markdown/static-markdown";

export const ADJACENT_PANEL_WIDTH = "clamp(320px, 38vw, 560px)";

const MARKDOWN_EXTENSIONS = [".md", ".markdown"];

export interface AdjacentPanelFile {
  id: string;
  name: string;
  type: string;
  url?: string;
}

export function isAdjacentPreviewSupported(file: {
  name: string;
  type: string;
}) {
  const name = file.name.toLowerCase();
  return (
    file.type === "text/markdown" ||
    MARKDOWN_EXTENSIONS.some((extension) => name.endsWith(extension))
  );
}

type PanelState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; content: string };

/**
 * Remount per file via a `key` on the file id so the loading state resets
 * without synchronously calling setState inside the fetch effect.
 */
export function AttachmentSidePanel({
  className,
  file,
  onClose,
}: {
  className?: string;
  file: AdjacentPanelFile;
  onClose: () => void;
}) {
  const [state, setState] = useState<PanelState>(() =>
    file.url
      ? { status: "loading" }
      : { status: "error", error: "This file is no longer available." },
  );

  useEffect(() => {
    if (!file.url) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    fetch(file.url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load file (${response.status})`);
        }
        return response.text();
      })
      .then((content) => {
        if (!cancelled) {
          setState({ status: "ready", content });
        }
      })
      .catch((fetchError: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          status: "error",
          error:
            fetchError instanceof Error
              ? fetchError.message
              : "Failed to load file.",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [file.url]);

  return (
    <aside
      className={cn(
        "border-border bg-background flex h-full min-h-0 shrink-0 flex-col border-l",
        className,
      )}
      style={{ width: ADJACENT_PANEL_WIDTH }}
    >
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <FileText className="text-muted-foreground size-4 shrink-0" />
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
          {file.name}
        </span>
        <Button
          aria-label="Close preview"
          className="shrink-0"
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {state.status === "loading" ? (
          <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            Loading…
          </div>
        ) : state.status === "error" ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
            <FileText className="size-8" />
            {state.error}
          </div>
        ) : (
          <StaticMarkdown content={state.content} />
        )}
      </div>
    </aside>
  );
}
