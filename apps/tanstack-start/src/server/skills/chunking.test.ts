import { describe, expect, it } from "vitest";

import { SKILL_LIMITS } from "@redux/types";

import {
  buildDerivedSkillChunks,
  decodeSkillChunk,
  formatSkillReadCursor,
  parseSkillReadCursor,
} from "./chunking";

function reconstruct(text: string) {
  const derived = buildDerivedSkillChunks(text);
  const bytes = derived.chunks.map((chunk) =>
    decodeSkillChunk(chunk.bytes, chunk.encoding),
  );
  const length = bytes.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const combined = new Uint8Array(length);
  let offset = 0;
  for (const chunk of bytes) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    derived,
    text: new TextDecoder().decode(combined),
  };
}

describe("skill chunking", () => {
  it("represents empty text without a stored chunk", () => {
    expect(buildDerivedSkillChunks("")).toMatchObject({
      normalizedText: "",
      totalLines: 1,
      chunks: [],
    });
  });

  it("normalizes CRLF while preserving unicode content", () => {
    const result = reconstruct("one\r\n😀 two\rthree");
    expect(result.text).toBe("one\n😀 two\nthree");
    expect(result.derived.totalLines).toBe(3);
  });

  it("splits oversized unicode-safe lines into bounded chunks", () => {
    const source = "😀".repeat(SKILL_LIMITS.chunkTargetBytes);
    const result = reconstruct(source);
    expect(result.text).toBe(source);
    expect(result.derived.chunks.length).toBeGreaterThan(1);
    expect(
      result.derived.chunks.every(
        (chunk) => chunk.uncompressedBytes <= SKILL_LIMITS.chunkTargetBytes,
      ),
    ).toBe(true);
  });

  it("limits chunks by line count", () => {
    const source = Array.from(
      { length: SKILL_LIMITS.chunkMaxLines + 10 },
      (_, index) => `${index}`,
    ).join("\n");
    const result = reconstruct(source);
    expect(result.text).toBe(source);
    expect(result.derived.chunks.length).toBeGreaterThan(1);
  });

  it("round-trips read cursors", () => {
    const cursor = {
      skillFileId: "file-id",
      chunkIndex: 7,
      byteOffset: 123,
    };
    expect(parseSkillReadCursor(formatSkillReadCursor(cursor))).toEqual(cursor);
    expect(() => parseSkillReadCursor("invalid")).toThrow(
      "Invalid skill file cursor",
    );
  });
});
