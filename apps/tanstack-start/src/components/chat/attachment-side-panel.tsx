"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";

import { Button } from "@redux/ui/components/button";
import { cn } from "@redux/ui/lib/utils";

import { StaticMarkdown } from "@/components/markdown/static-markdown";

export const ADJACENT_PANEL_WIDTH = "clamp(320px, 38vw, 560px)";

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
        ) : state.content.length === 0 ? (
          <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
            This file is empty.
          </div>
        ) : (
          <StaticMarkdown
            content={
              asMarkdown
                ? state.content
                : toFencedCodeBlock(state.content, languageForFile(file.name))
            }
          />
        )}
      </div>
    </aside>
  );
}
