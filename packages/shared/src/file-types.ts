/**
 * Shared file-type constants used for attachment classification,
 * adjacent panel preview support, and syntax highlighting.
 */

export const MARKDOWN_EXTENSIONS = [".md", ".markdown", ".mdx"] as const;

export const TEXT_EXTENSIONS = [
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
  ".cmd",
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
] as const;

export const TEXT_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/x-sh",
  "application/x-yaml",
  "application/yaml",
  "application/sql",
  "image/svg+xml",
] as const;

export const EXTENSIONLESS_TEXT_FILENAMES = [
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
] as const;

export const EXTENSION_LANGUAGE: Record<string, string> = {
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

export function getFileExtension(name: string) {
  const lower = name.toLowerCase();
  const lastDot = lower.lastIndexOf(".");
  return lastDot >= 0 ? lower.slice(lastDot) : "";
}

export function isMarkdownFile(file: { name: string; type: string }) {
  return (
    file.type === "text/markdown" ||
    (MARKDOWN_EXTENSIONS as readonly string[]).includes(
      getFileExtension(file.name),
    )
  );
}

const TEXT_MIME_SET = new Set<string>(TEXT_MIME_TYPES);
const EXTENSIONLESS_SET = new Set<string>(EXTENSIONLESS_TEXT_FILENAMES);

export function isTextPreviewSupported(file: { name: string; type: string }) {
  const name = file.name.toLowerCase();
  const extension = getFileExtension(name);
  return (
    file.type.startsWith("text/") ||
    TEXT_MIME_SET.has(file.type) ||
    isMarkdownFile(file) ||
    (TEXT_EXTENSIONS as readonly string[]).includes(extension) ||
    EXTENSIONLESS_SET.has(name)
  );
}

export function languageForFile(name: string) {
  const extension = getFileExtension(name).replace(/^\./, "");
  if (extension) {
    return EXTENSION_LANGUAGE[extension] ?? extension;
  }
  const lower = name.toLowerCase();
  if (lower === "dockerfile") return "dockerfile";
  if (lower === "makefile") return "makefile";
  return "text";
}
