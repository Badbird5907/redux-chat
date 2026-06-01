"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import { cn } from "@redux/ui/lib/utils";

import { StaticMarkdown } from "@/components/markdown/static-markdown";

const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 720;
const PANEL_DEFAULT_WIDTH = 440;
const PANEL_WIDTH_KEY = "redux:adjacent-panel-width";

const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".mdx"];

const TEXT_EXTENSIONS = [
  ".txt",
  ".text",
  ".log",
  ".csv",
  ".tsv",
  ".json",
  ".jsonc",
  ".json5",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".cfg",
  ".conf",
  ".env",
  ".properties",
  ".xml",
  ".svg",
  ".html",
  ".htm",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".kts",
  ".c",
  ".h",
  ".cpp",
  ".cc",
  ".cxx",
  ".hpp",
  ".cs",
  ".php",
  ".swift",
  ".scala",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".bat",
  ".sql",
  ".graphql",
  ".gql",
  ".proto",
  ".vue",
  ".svelte",
  ".astro",
  ".lua",
  ".pl",
  ".r",
  ".dart",
  ".ex",
  ".exs",
  ".clj",
  ".hs",
  ".elm",
  ".jl",
  ".nim",
  ".zig",
  ".tf",
  ".hcl",
  ".gradle",
  ".diff",
  ".patch",
];

const TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/x-sh",
  "application/x-yaml",
  "application/yaml",
  "image/svg+xml",
]);

const EXTENSIONLESS_TEXT_FILENAMES = new Set([
  "dockerfile",
  "makefile",
  "license",
  "readme",
  ".gitignore",
  ".gitattributes",
  ".npmrc",
  ".prettierrc",
  ".eslintrc",
  ".editorconfig",
]);

const EXTENSION_LANGUAGE: Record<string, string> = {
  mjs: "javascript",
  cjs: "javascript",
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "tsx",
  py: "python",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  kts: "kotlin",
  yml: "yaml",
  h: "c",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cs: "csharp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  htm: "html",
  gql: "graphql",
  pl: "perl",
  ex: "elixir",
  exs: "elixir",
  clj: "clojure",
  hs: "haskell",
  jl: "julia",
  tf: "hcl",
  patch: "diff",
};

export interface AdjacentPanelFile {
  id: string;
  name: string;
  type: string;
  url?: string;
}

function getExtension(name: string) {
  const lower = name.toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  return lastDot >= 0 ? lower.slice(lastDot) : "";
}

function isMarkdownFile(file: { name: string; type: string }) {
  return (
    file.type === "text/markdown" ||
    MARKDOWN_EXTENSIONS.includes(getExtension(file.name))
  );
}

export function isAdjacentPreviewSupported(file: {
  name: string;
  type: string;
}) {
  const name = file.name.toLowerCase();
  const extension = getExtension(name);
  return (
    file.type.startsWith("text/") ||
    TEXT_MIME_TYPES.has(file.type) ||
    isMarkdownFile(file) ||
    TEXT_EXTENSIONS.includes(extension) ||
    EXTENSIONLESS_TEXT_FILENAMES.has(name)
  );
}

function languageForFile(name: string) {
  const extension = getExtension(name).replace(/^\./, "");
  if (extension) {
    return EXTENSION_LANGUAGE[extension] ?? extension;
  }
  if (name.toLowerCase() === "dockerfile") {
    return "dockerfile";
  }
  if (name.toLowerCase() === "makefile") {
    return "makefile";
  }
  return "text";
}

function toFencedCodeBlock(content: string, language: string) {
  const longestBacktickRun = (content.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0,
  );
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

type PanelState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; content: string };

function FileTabContent({ file }: { file: AdjacentPanelFile }) {
  const [state, setState] = useState<PanelState>(() =>
    file.url
      ? { status: "loading" }
      : { status: "error", error: "This file is no longer available." },
  );

  const asMarkdown = isMarkdownFile(file);

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

  if (state.status === "loading") {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-sm">
        <FileText className="size-8" />
        {state.error}
      </div>
    );
  }

  if (state.content.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
        This file is empty.
      </div>
    );
  }

  return (
    <StaticMarkdown
      content={
        asMarkdown
          ? state.content
          : toFencedCodeBlock(state.content, languageForFile(file.name))
      }
    />
  );
}

function getInitialWidth() {
  if (typeof window === "undefined") {
    return PANEL_DEFAULT_WIDTH;
  }
  const stored = window.localStorage.getItem(PANEL_WIDTH_KEY);
  if (stored) {
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      return Math.min(Math.max(parsed, PANEL_MIN_WIDTH), PANEL_MAX_WIDTH);
    }
  }
  return PANEL_DEFAULT_WIDTH;
}

export function AttachmentSidePanel({
  activeFileId,
  className,
  files,
  onClose,
  onCloseAll,
  onSelectTab,
  onWidthChange,
}: {
  activeFileId: string;
  className?: string;
  files: AdjacentPanelFile[];
  onClose: (fileId: string) => void;
  onCloseAll: () => void;
  onSelectTab: (fileId: string) => void;
  onWidthChange?: (width: number) => void;
}) {
  const [width, setWidth] = useState(getInitialWidth);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const persistWidth = useCallback((w: number) => {
    try {
      window.localStorage.setItem(PANEL_WIDTH_KEY, String(w));
    } catch {
      // storage full or unavailable
    }
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      draggingRef.current = true;
      startXRef.current = event.clientX;
      startWidthRef.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [width],
  );

  useEffect(() => {
    onWidthChange?.(width);
  }, [width, onWidthChange]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!draggingRef.current) {
        return;
      }
      const delta = startXRef.current - event.clientX;
      const next = Math.min(
        Math.max(startWidthRef.current + delta, PANEL_MIN_WIDTH),
        PANEL_MAX_WIDTH,
      );
      setWidth(next);
    };

    const handleMouseUp = () => {
      if (!draggingRef.current) {
        return;
      }
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setWidth((w) => {
        persistWidth(w);
        return w;
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [persistWidth]);

  const activeFile = files.find((f) => f.id === activeFileId) ?? files[0];
  if (!activeFile) {
    return null;
  }

  const hasTabs = files.length > 1;

  return (
    <aside
      className={cn(
        "border-border bg-background relative flex h-full min-h-0 shrink-0 flex-col border-l",
        className,
      )}
      style={{ width }}
    >
      {/* Resize handle */}
      <div
        className="hover:bg-primary/20 active:bg-primary/30 absolute top-0 bottom-0 left-0 z-10 w-1 cursor-col-resize"
        onMouseDown={handleMouseDown}
        role="separator"
        aria-orientation="vertical"
      />

      {/* Tab bar / header */}
      {hasTabs ? (
        <div className="border-border flex min-h-0 items-end border-b">
          <div className="flex min-w-0 flex-1 overflow-x-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className={cn(
                  "group border-border flex max-w-48 items-center gap-1.5 border-r px-3 py-2 text-sm",
                  file.id === activeFile.id
                    ? "bg-background text-foreground"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/60 cursor-pointer",
                )}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left"
                  title={file.name}
                  onClick={() => onSelectTab(file.id)}
                >
                  {file.name}
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground -mr-1 shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Close tab"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(file.id);
                  }}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
          <Button
            aria-label="Close all tabs"
            className="shrink-0"
            onClick={onCloseAll}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <div className="border-border flex items-center gap-2 border-b px-4 py-3">
          <FileText className="text-muted-foreground size-4 shrink-0" />
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
            {activeFile.name}
          </span>
          <Button
            aria-label="Close preview"
            className="shrink-0"
            onClick={onCloseAll}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* File content */}
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        <FileTabContent key={activeFile.id} file={activeFile} />
      </div>
    </aside>
  );
}

export function getAdjacentPanelWidth(): number {
  return getInitialWidth();
}
