import { parse, stringify } from "yaml";

import { SKILL_LIMITS } from "@redux/types";

export interface SkillPackageFile {
  path: string;
  bytes: Uint8Array;
  mimeType: string;
  isText: boolean;
  text?: string;
  lineCount?: number;
  sha256: string;
  isSymlink?: boolean;
  lfsPointer?: boolean;
}

export interface NormalizedSkillMetadata {
  name: string;
  description: string;
  content: string;
  metadataWasInferred: boolean;
}

const TEXT_EXTENSIONS = new Set([
  "c",
  "cc",
  "conf",
  "cpp",
  "cs",
  "css",
  "csv",
  "go",
  "graphql",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "kt",
  "md",
  "mdx",
  "php",
  "properties",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sql",
  "svg",
  "toml",
  "ts",
  "tsx",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  css: "text/css",
  csv: "text/csv",
  gif: "image/gif",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  json: "application/json",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  ts: "text/typescript",
  tsx: "text/typescript",
  txt: "text/plain",
  webp: "image/webp",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
};

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function normalizeSkillPath(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.length > SKILL_LIMITS.maxPathLength ||
    normalized.startsWith("/") ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        hasControlCharacters(segment),
    )
  ) {
    throw new Error(`Invalid skill path: ${path}`);
  }
  return normalized;
}

export function mimeTypeForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

function extensionForPath(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

export function decodeTextFile(bytes: Uint8Array, path: string) {
  if (bytes.includes(0)) return undefined;
  const extension = extensionForPath(path);
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (TEXT_EXTENSIONS.has(extension)) return text;
    const printable = [...text.slice(0, 4096)].filter((character) => {
      const code = character.charCodeAt(0);
      return code === 9 || code === 10 || code === 13 || code >= 32;
    }).length;
    return text.length === 0 || printable / Math.min(text.length, 4096) > 0.9
      ? text
      : undefined;
  } catch {
    return undefined;
  }
}

export async function sha256Hex(bytes: Uint8Array) {
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", source);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function stripMarkdown(value: string) {
  return value
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[*_~>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveName(body: string, fileName: string) {
  const heading = /^#\s+(.+)$/m.exec(body)?.[1];
  if (heading)
    return stripMarkdown(heading).slice(0, SKILL_LIMITS.maxNameLength);
  const baseName = fileName.replace(/\.md$/i, "").replace(/[-_]+/g, " ");
  return (
    baseName
      .replace(/\b\w/g, (character) => character.toUpperCase())
      .slice(0, SKILL_LIMITS.maxNameLength) || "Imported Skill"
  );
}

function deriveDescription(body: string) {
  const blocks = body.split(/\n\s*\n/);
  for (const block of blocks) {
    const normalized = stripMarkdown(block);
    if (
      normalized &&
      !/^[-\s]*$/.test(normalized) &&
      !block.trimStart().startsWith("#")
    ) {
      return normalized.slice(0, SKILL_LIMITS.maxDescriptionLength);
    }
  }
  return "Imported skill";
}

export function normalizeSkillMarkdown(input: {
  content: string;
  fileName: string;
  rewriteFrontmatter: boolean;
}): NormalizedSkillMetadata {
  const match = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/.exec(
    input.content,
  );
  let metadata: Record<string, unknown> = {};
  let body = input.content;
  if (match) {
    try {
      const parsed: unknown = parse(match[1] ?? "");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed as Record<string, unknown>;
      }
    } catch (error) {
      throw new Error(
        error instanceof Error
          ? `Invalid SKILL.md frontmatter: ${error.message}`
          : "Invalid SKILL.md frontmatter",
      );
    }
    body = input.content.slice(match[0].length);
  }

  const rawName = typeof metadata.name === "string" ? metadata.name.trim() : "";
  const rawDescription =
    typeof metadata.description === "string" ? metadata.description.trim() : "";
  const name = (rawName || deriveName(body, input.fileName)).slice(
    0,
    SKILL_LIMITS.maxNameLength,
  );
  const description = (rawDescription || deriveDescription(body)).slice(
    0,
    SKILL_LIMITS.maxDescriptionLength,
  );
  const metadataWasInferred = !rawName || !rawDescription;

  if (!input.rewriteFrontmatter) {
    return { name, description, content: input.content, metadataWasInferred };
  }

  const frontmatter = stringify({
    ...metadata,
    name,
    description,
  }).trimEnd();
  return {
    name,
    description,
    content: `---\n${frontmatter}\n---\n\n${body.replace(/^\s+/, "")}`,
    metadataWasInferred,
  };
}

export async function buildSkillPackageFile(input: {
  path: string;
  bytes: Uint8Array;
  mimeType?: string;
  isSymlink?: boolean;
}): Promise<SkillPackageFile> {
  const path = normalizeSkillPath(input.path);
  if (input.bytes.byteLength > SKILL_LIMITS.maxFileBytes) {
    throw new Error(
      `${path} exceeds the ${SKILL_LIMITS.maxFileBytes} byte limit`,
    );
  }
  const text = decodeTextFile(input.bytes, path);
  const lfsPointer =
    text?.startsWith("version https://git-lfs.github.com/spec/v1\n") ?? false;
  return {
    path,
    bytes: input.bytes,
    mimeType: input.mimeType ?? mimeTypeForPath(path),
    isText: text !== undefined,
    text,
    lineCount: text === undefined ? undefined : text.split(/\r?\n/).length,
    sha256: await sha256Hex(input.bytes),
    isSymlink: input.isSymlink,
    lfsPointer,
  };
}

export function validateSkillPackage(files: SkillPackageFile[]) {
  if (files.length === 0 || files.length > SKILL_LIMITS.maxFilesPerSkill) {
    throw new Error(
      `Skills support up to ${SKILL_LIMITS.maxFilesPerSkill} files`,
    );
  }
  const totalBytes = files.reduce(
    (sum, file) => sum + file.bytes.byteLength,
    0,
  );
  if (totalBytes > SKILL_LIMITS.maxTotalBytes) {
    throw new Error(
      `Skill package exceeds ${SKILL_LIMITS.maxTotalBytes} bytes`,
    );
  }
  const seen = new Set<string>();
  for (const file of files) {
    const key = file.path.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate skill path: ${file.path}`);
    seen.add(key);
  }
  const entrypoint = files.find((file) => file.path === "SKILL.md");
  if (!entrypoint?.text) {
    throw new Error("Skill package must contain a UTF-8 root SKILL.md");
  }
  if (entrypoint.bytes.byteLength > SKILL_LIMITS.maxEntrypointBytes) {
    throw new Error("SKILL.md is too large");
  }
  return { entrypoint, totalBytes };
}
