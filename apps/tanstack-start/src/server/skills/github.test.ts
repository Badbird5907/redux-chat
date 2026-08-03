import { Buffer } from "node:buffer";
import { gzipSync } from "node:zlib";
import * as tar from "tar-stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveGitHubSkill } from "@/server/skills/github";

vi.mock("@/env", () => ({ env: { GITHUB_IMPORT_TOKEN: "" } }));

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

async function buildArchive() {
  const pack = tar.pack();
  const chunks: Buffer[] = [];
  pack.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>((resolve, reject) => {
    pack.on("end", () => resolve(gzipSync(Buffer.concat(chunks))));
    pack.on("error", reject);
  });
  pack.entry(
    { name: "owner-repo-abcdef/skill/SKILL.md" },
    "---\nname: Archive Skill\ndescription: Imported from one archive\n---\n\n# Skill",
  );
  pack.entry({ name: "owner-repo-abcdef/skill/guide.md" }, "Supporting guide");
  pack.entry(
    { name: "owner-repo-abcdef/skill/agents/openai.yaml" },
    "interface:\n  display_name: Archive Skill",
  );
  pack.entry(
    { name: "owner-repo-abcdef/skill/references/data.json" },
    '{"ignored":true}',
  );
  pack.entry(
    { name: "owner-repo-abcdef/skill/references/config.yml" },
    "ignored: true",
  );
  pack.entry(
    { name: "owner-repo-abcdef/skill/references/config.yaml" },
    "ignored: true",
  );
  pack.entry(
    { name: "owner-repo-abcdef/skill/.claude/command.md" },
    "Ignored Claude config",
  );
  pack.entry(
    { name: "owner-repo-abcdef/skill/nested/.agents/notes.md" },
    "Ignored agent config",
  );
  pack.entry(
    { name: "owner-repo-abcdef/skill/.github/workflows/check.yml" },
    "Ignored GitHub workflow",
  );
  pack.entry({
    name: "owner-repo-abcdef/skill/guide-link",
    type: "symlink",
    linkname: "guide.md",
  });
  pack.finalize();
  return finished;
}

describe("resolveGitHubSkill", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads one pinned tarball and extracts the selected subtree", async () => {
    const archive = await buildArchive();
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = requestUrl(input);
      if (url.includes("/commits/main%2Fskill")) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      if (url.includes("/commits/main")) {
        return Promise.resolve(Response.json({ sha: "abcdef123456" }));
      }
      if (url.includes("/git/trees/abcdef123456")) {
        return Promise.resolve(
          Response.json({
            truncated: false,
            tree: [
              {
                path: "skill/SKILL.md",
                mode: "100644",
                type: "blob",
                sha: "skill-sha",
                size: 78,
              },
              {
                path: "skill/guide.md",
                mode: "100644",
                type: "blob",
                sha: "guide-sha",
                size: 16,
              },
              {
                path: "skill/agents/openai.yaml",
                mode: "100644",
                type: "blob",
                sha: "metadata-sha",
                size: 40,
              },
              {
                path: "skill/references/data.json",
                mode: "100644",
                type: "blob",
                sha: "json-sha",
                size: 16,
              },
              {
                path: "skill/references/config.yml",
                mode: "100644",
                type: "blob",
                sha: "yml-sha",
                size: 13,
              },
              {
                path: "skill/references/config.yaml",
                mode: "100644",
                type: "blob",
                sha: "yaml-sha",
                size: 13,
              },
              {
                path: "skill/.claude/command.md",
                mode: "100644",
                type: "blob",
                sha: "claude-sha",
                size: 21,
              },
              {
                path: "skill/nested/.agents/notes.md",
                mode: "100644",
                type: "blob",
                sha: "agents-sha",
                size: 20,
              },
              {
                path: "skill/.github/workflows/check.yml",
                mode: "100644",
                type: "blob",
                sha: "github-sha",
                size: 23,
              },
              {
                path: "skill/guide-link",
                mode: "120000",
                type: "blob",
                sha: "link-sha",
                size: 8,
              },
            ],
          }),
        );
      }
      if (url.includes("/tarball/abcdef123456")) {
        const body = archive.buffer.slice(
          archive.byteOffset,
          archive.byteOffset + archive.byteLength,
        ) as ArrayBuffer;
        return Promise.resolve(new Response(body));
      }
      return Promise.reject(new Error(`Unexpected GitHub request: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveGitHubSkill(
      "https://github.com/owner/repo/tree/main/skill",
    );

    expect(result.name).toBe("Archive Skill");
    expect(result.files.map((file) => file.path)).toEqual([
      "SKILL.md",
      "guide.md",
      "agents/openai.yaml",
      "guide-link",
    ]);
    expect(result.files[3]).toMatchObject({
      isSymlink: true,
      text: "guide.md",
    });
    const requestedUrls = fetchMock.mock.calls.map(([input]) =>
      requestUrl(input),
    );
    expect(
      requestedUrls.filter((url) => url.includes("/tarball/")),
    ).toHaveLength(1);
    expect(requestedUrls.some((url) => url.includes("/git/blobs/"))).toBe(
      false,
    );
  });
});
