import { Buffer } from "node:buffer";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import * as tar from "tar-stream";

import { SKILL_LIMITS } from "@redux/types";

import { env } from "@/env";
import { mapWithConcurrency } from "@/server/skills/concurrency";
import {
  buildSkillPackageFile,
  normalizeSkillMarkdown,
  validateSkillPackage,
} from "@/server/skills/validation";

interface GitHubRepositoryResponse {
  default_branch: string;
}

interface GitHubCommitResponse {
  sha: string;
}

interface GitHubTreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

interface GitHubTreeResponse {
  tree: GitHubTreeEntry[];
  truncated: boolean;
}

const IGNORED_GITHUB_SKILL_DIRECTORIES = new Set([
  ".agents",
  ".claude",
  ".github",
]);

const PRESERVED_GITHUB_SKILL_METADATA = new Set(["agents/openai.yaml"]);

export interface ResolvedGitHubSkill {
  name: string;
  description: string;
  entrypointText: string;
  metadataWasInferred: boolean;
  files: Awaited<ReturnType<typeof buildSkillPackageFile>>[];
  source: {
    sourceType: "github";
    githubOriginalUrl: string;
    githubOwner: string;
    githubRepository: string;
    githubRequestedRef: string;
    githubSelectedPath: string;
    githubCommitSha: string;
  };
}

function githubHeaders(accept = "application/vnd.github+json") {
  return {
    Accept: accept,
    "User-Agent": "redux-chat-skill-importer",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(env.GITHUB_IMPORT_TOKEN
      ? { Authorization: `Bearer ${env.GITHUB_IMPORT_TOKEN}` }
      : {}),
  };
}

function shouldImportGitHubSkillEntry(
  entry: GitHubTreeEntry & { relativePath: string },
) {
  const normalizedPath = entry.relativePath.toLowerCase();
  const segments = normalizedPath.split("/");
  const directorySegments =
    entry.type === "blob" ? segments.slice(0, -1) : segments;

  if (
    directorySegments.some((segment) =>
      IGNORED_GITHUB_SKILL_DIRECTORIES.has(segment),
    )
  ) {
    return false;
  }

  if (PRESERVED_GITHUB_SKILL_METADATA.has(normalizedPath)) return true;

  return !/\.(?:json|ya?ml)$/i.test(normalizedPath);
}

function throwGitHubResponseError(response: Response): never {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  if (response.status === 403 && remaining === "0") {
    const resetText = reset
      ? new Date(Number(reset) * 1000).toLocaleTimeString()
      : "later";
    throw new Error(
      `GitHub import rate limit reached. Try again after ${resetText}.`,
    );
  }
  if (response.status === 404) {
    throw new Error(
      "GitHub repository or path was not found. Only public repositories are supported.",
    );
  }
  throw new Error(
    `GitHub import failed: ${response.status} ${response.statusText}`,
  );
}

async function githubFetch<T>(path: string, allowNotFound = false) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: githubHeaders(),
      signal: controller.signal,
    });
    if (response.ok) return (await response.json()) as T;
    if (allowNotFound && response.status === 404) return undefined;
    throwGitHubResponseError(response);
  } finally {
    clearTimeout(timeout);
  }
}

function parseGitHubUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error("Enter a valid GitHub URL");
  }
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "Skills can only be imported from public https://github.com URLs",
    );
  }
  const segments = url.pathname
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .filter(Boolean);
  const owner = segments[0];
  const repository = segments[1]?.replace(/\.git$/i, "");
  if (!owner || !repository)
    throw new Error("GitHub URL must include an owner and repository");
  const kind = segments[2];
  if (kind && kind !== "tree" && kind !== "blob") {
    throw new Error("Use a GitHub repository, folder, or SKILL.md URL");
  }
  return {
    originalUrl: url.toString(),
    owner,
    repository,
    kind: kind as "tree" | "blob" | undefined,
    tail: segments.slice(3),
  };
}

async function resolveRef(input: {
  owner: string;
  repository: string;
  kind: "tree" | "blob" | undefined;
  tail: string[];
}) {
  if (!input.kind) {
    const repository = await githubFetch<GitHubRepositoryResponse>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`,
    );
    if (!repository) throw new Error("GitHub repository was not found");
    const commit = await githubFetch<GitHubCommitResponse>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/commits/${encodeURIComponent(repository.default_branch)}`,
    );
    if (!commit) throw new Error("GitHub branch was not found");
    return {
      requestedRef: repository.default_branch,
      commitSha: commit.sha,
      selectedPath: "",
    };
  }
  if (input.tail.length === 0)
    throw new Error("GitHub URL is missing a branch or commit");
  const maxAttempts = Math.min(input.tail.length, 12);
  for (let count = maxAttempts; count >= 1; count -= 1) {
    const requestedRef = input.tail.slice(0, count).join("/");
    const commit = await githubFetch<GitHubCommitResponse>(
      `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/commits/${encodeURIComponent(requestedRef)}`,
      true,
    );
    if (!commit) continue;
    const remainingPath = input.tail.slice(count).join("/");
    if (input.kind === "blob") {
      if (
        !remainingPath.endsWith("/SKILL.md") &&
        remainingPath !== "SKILL.md"
      ) {
        throw new Error("Direct GitHub file imports must point to SKILL.md");
      }
      const selectedPath = remainingPath.split("/").slice(0, -1).join("/");
      return { requestedRef, commitSha: commit.sha, selectedPath };
    }
    return {
      requestedRef,
      commitSha: commit.sha,
      selectedPath: remainingPath.replace(/^\/+|\/+$/g, ""),
    };
  }
  throw new Error(
    "Unable to resolve the branch, tag, or commit in that GitHub URL",
  );
}

async function downloadGitHubTarball(input: {
  owner: string;
  repository: string;
  commitSha: string;
  blobs: (GitHubTreeEntry & { relativePath: string })[];
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}/tarball/${encodeURIComponent(input.commitSha)}`,
      {
        headers: githubHeaders("application/vnd.github+json"),
        signal: controller.signal,
      },
    );
    if (!response.ok) throwGitHubResponseError(response);
    if (!response.body) throw new Error("GitHub archive response was empty");

    const expectedByPath = new Map(
      input.blobs.map((blob) => [blob.path, blob] as const),
    );
    const extracted = new Map<string, Uint8Array>();
    const extract = tar.extract();
    extract.on("entry", (header, stream, next) => {
      const repositoryPath = header.name.split("/").slice(1).join("/");
      const blob = expectedByPath.get(repositoryPath);
      if (!blob) {
        stream.on("end", next);
        stream.resume();
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;
      const finish = (error?: Error | null) => {
        if (settled) return;
        settled = true;
        next(error ?? undefined);
      };
      stream.on("data", (chunk: Buffer) => {
        totalBytes += chunk.byteLength;
        if (totalBytes > SKILL_LIMITS.maxFileBytes) {
          stream.destroy(new Error(`${blob.relativePath} is too large`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", finish);
      stream.on("end", () => {
        if (settled) return;
        const bytes =
          blob.mode === "120000"
            ? Buffer.from(header.linkname ?? "", "utf8")
            : Buffer.concat(chunks);
        extracted.set(blob.path, Uint8Array.from(bytes));
        finish();
      });
    });

    await pipeline(
      Readable.fromWeb(response.body as NodeReadableStream),
      createGunzip(),
      extract,
    );

    return mapWithConcurrency(input.blobs, 6, async (blob) => {
      const bytes = extracted.get(blob.path);
      if (!bytes)
        throw new Error(`GitHub archive omitted ${blob.relativePath}`);
      return buildSkillPackageFile({
        path: blob.relativePath,
        bytes,
        isSymlink: blob.mode === "120000",
      });
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function resolveGitHubSkill(
  rawUrl: string,
): Promise<ResolvedGitHubSkill> {
  const parsed = parseGitHubUrl(rawUrl);
  const resolved = await resolveRef(parsed);
  const tree = await githubFetch<GitHubTreeResponse>(
    `/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repository)}/git/trees/${encodeURIComponent(resolved.commitSha)}?recursive=1`,
  );
  if (!tree) throw new Error("GitHub repository tree was not found");
  if (tree.truncated)
    throw new Error("This GitHub repository is too large to import safely");

  const prefix = resolved.selectedPath ? `${resolved.selectedPath}/` : "";
  const entries = tree.tree.flatMap((entry) => {
    if (entry.type === "tree" || !entry.path.startsWith(prefix)) return [];
    const relativePath = entry.path.slice(prefix.length);
    if (!relativePath) return [];
    const skillEntry = { ...entry, relativePath };
    return shouldImportGitHubSkillEntry(skillEntry) ? [skillEntry] : [];
  });
  if (
    entries.some((entry) => entry.type === "commit" || entry.mode === "160000")
  ) {
    throw new Error(
      "GitHub skill folders containing submodules are not supported",
    );
  }
  const blobs = entries.filter((entry) => entry.type === "blob");
  if (blobs.length > SKILL_LIMITS.maxFilesPerSkill) {
    throw new Error(
      `Skills support up to ${SKILL_LIMITS.maxFilesPerSkill} files`,
    );
  }
  let expectedBytes = 0;
  for (const blob of blobs) {
    const size = blob.size ?? 0;
    if (size > SKILL_LIMITS.maxFileBytes)
      throw new Error(`${blob.relativePath} is too large`);
    expectedBytes += size;
  }
  if (expectedBytes > SKILL_LIMITS.maxTotalBytes) {
    throw new Error("GitHub skill exceeds the total size limit");
  }
  if (!blobs.some((entry) => entry.relativePath === "SKILL.md")) {
    throw new Error(
      "The selected GitHub folder does not contain a root SKILL.md",
    );
  }

  const files = await downloadGitHubTarball({
    owner: parsed.owner,
    repository: parsed.repository,
    commitSha: resolved.commitSha,
    blobs,
  });
  const { entrypoint } = validateSkillPackage(files);
  const normalized = normalizeSkillMarkdown({
    content: entrypoint.text ?? "",
    fileName: "SKILL.md",
    rewriteFrontmatter: false,
  });
  return {
    name: normalized.name,
    description: normalized.description,
    entrypointText: normalized.content,
    metadataWasInferred: normalized.metadataWasInferred,
    files,
    source: {
      sourceType: "github",
      githubOriginalUrl: parsed.originalUrl,
      githubOwner: parsed.owner,
      githubRepository: parsed.repository,
      githubRequestedRef: resolved.requestedRef,
      githubSelectedPath: resolved.selectedPath,
      githubCommitSha: resolved.commitSha,
    },
  };
}
