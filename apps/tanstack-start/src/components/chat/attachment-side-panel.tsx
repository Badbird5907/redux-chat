"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@redux/ui/components/tabs";
import { cn } from "@redux/ui/lib/utils";

import { FileTypeIcon } from "@/components/chat/file-type-icon";
import { StaticMarkdown } from "@/components/markdown/static-markdown";

export const ADJACENT_PANEL_MIN_WIDTH = 280;
export const ADJACENT_PANEL_MAX_WIDTH = 720;
export const ADJACENT_PANEL_DEFAULT_WIDTH = 440;
const ADJACENT_PANEL_LAYOUT_KEY = "redux:adjacent-panel-layout";
const ADJACENT_PANEL_WIDTH_KEY = "redux:adjacent-panel-width";

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
        <FileTypeIcon className="size-8" fileName={file.name} />
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
    return ADJACENT_PANEL_DEFAULT_WIDTH;
  }
  const stored = window.localStorage.getItem(ADJACENT_PANEL_WIDTH_KEY);
  if (stored) {
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      return Math.min(
        Math.max(parsed, ADJACENT_PANEL_MIN_WIDTH),
        ADJACENT_PANEL_MAX_WIDTH,
      );
    }
  }
  return ADJACENT_PANEL_DEFAULT_WIDTH;
}

export function getStoredAdjacentPanelLayout():
  | Record<string, number>
  | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const storedLayout = window.localStorage.getItem(ADJACENT_PANEL_LAYOUT_KEY);
    if (storedLayout) {
      const parsed = JSON.parse(storedLayout) as Record<string, number>;
      if (typeof parsed === "object" && typeof parsed.attachment === "number") {
        return parsed;
      }
    }
  } catch {
    // ignore invalid layout
  }

  return undefined;
}

export function persistAdjacentPanelLayout(layout: Record<string, number>) {
  try {
    window.localStorage.setItem(
      ADJACENT_PANEL_LAYOUT_KEY,
      JSON.stringify(layout),
    );
  } catch {
    // storage full or unavailable
  }
}

export function AttachmentSidePanel({
  activeFileId,
  className,
  files,
  onClose,
  onCloseAll,
  onSelectTab,
}: {
  activeFileId: string;
  className?: string;
  files: AdjacentPanelFile[];
  onClose: (fileId: string) => void;
  onCloseAll: () => void;
  onSelectTab: (fileId: string) => void;
}) {
  const activeFile = files.find((f) => f.id === activeFileId) ?? files[0];
  if (!activeFile) {
    return null;
  }

  const hasTabs = files.length > 1;

  return (
    <aside
      className={cn(
        "border-border bg-background relative flex h-full min-h-0 w-full flex-col border-l",
        className,
      )}
    >
      {/* Tab bar / header */}
      {hasTabs ? (
        <Tabs
          className="border-border/60 flex h-12 shrink-0 flex-row gap-0 overflow-hidden border-b"
          value={activeFileId}
          onValueChange={(value) => {
            if (typeof value === "string") {
              onSelectTab(value);
            }
          }}
        >
          <div className="flex h-full w-full min-w-0 items-center gap-2 px-4">
            <div
              className="scrollbar-none min-w-0 flex-1 overflow-x-auto overflow-y-hidden [&::-webkit-scrollbar]:hidden"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            >
              <TabsList className="w-max">
                {files.map((file) => (
                  <TabsTrigger
                    key={file.id}
                    className="group/tab max-w-48 flex-none shrink-0 gap-1.5 pr-1 after:hidden data-active:[&_button]:opacity-100"
                    value={file.id}
                  >
                    <FileTypeIcon className="size-4" fileName={file.name} />
                    <span className="min-w-0 truncate">{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Close ${file.name}`}
                      className="text-muted-foreground hover:text-foreground shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover/tab:opacity-100"
                      title="Close tab"
                      onClick={(event) => {
                        event.stopPropagation();
                        onClose(file.id);
                      }}
                    >
                      <X className="size-3" />
                    </button>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <Button
              aria-label="Close all tabs"
              className="size-8 shrink-0"
              onClick={onCloseAll}
              size="icon"
              variant="ghost"
            >
              <X className="size-4" />
            </Button>
          </div>
        </Tabs>
      ) : (
        <div className="border-border/60 flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <FileTypeIcon className="size-4" fileName={activeFile.name} />
          <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
            {activeFile.name}
          </span>
          <Button
            aria-label="Close preview"
            className="size-8 shrink-0"
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
