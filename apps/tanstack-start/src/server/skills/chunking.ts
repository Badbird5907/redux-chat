import { gunzipSync, gzipSync } from "node:zlib";

import type {
  SkillChunkEncoding,
  SkillFileChunkRoute,
  SkillFileReadCursor,
} from "@redux/types";
import { SKILL_LIMITS } from "@redux/types";

export interface DerivedSkillChunk extends SkillFileChunkRoute {
  bytes: Uint8Array;
  encoding: SkillChunkEncoding;
}

export interface DerivedSkillChunks {
  normalizedText: string;
  totalLines: number;
  chunks: DerivedSkillChunk[];
}

function compressChunk(bytes: Uint8Array) {
  const compressed = new Uint8Array(gzipSync(bytes));
  return compressed.byteLength < bytes.byteLength
    ? { bytes: compressed, encoding: "gzip" as const }
    : { bytes, encoding: "identity" as const };
}

export function buildDerivedSkillChunks(text: string): DerivedSkillChunks {
  const normalizedText = text.replace(/\r\n?/g, "\n");
  const totalLines = normalizedText.split("\n").length;
  if (normalizedText.length === 0) {
    return { normalizedText, totalLines, chunks: [] };
  }

  const encoder = new TextEncoder();
  const chunks: DerivedSkillChunk[] = [];
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let pendingNewlines = 0;
  let line = 1;
  let byteInLine = 0;
  let startLine = line;
  let startByteInLine = byteInLine;

  const flush = () => {
    if (pendingBytes === 0) return;
    const raw = new Uint8Array(pendingBytes);
    let offset = 0;
    for (const part of pending) {
      raw.set(part, offset);
      offset += part.byteLength;
    }
    const stored = compressChunk(raw);
    chunks.push({
      chunkIndex: chunks.length,
      startLine,
      endLine: line,
      startByteInLine,
      endByteInLine: byteInLine,
      uncompressedBytes: raw.byteLength,
      storedBytes: stored.bytes.byteLength,
      bytes: stored.bytes,
      encoding: stored.encoding,
    });
    pending = [];
    pendingBytes = 0;
    pendingNewlines = 0;
    startLine = line;
    startByteInLine = byteInLine;
  };

  for (const character of normalizedText) {
    const encoded = encoder.encode(character);
    const wouldExceedBytes =
      pendingBytes > 0 &&
      pendingBytes + encoded.byteLength > SKILL_LIMITS.chunkTargetBytes;
    if (wouldExceedBytes) flush();

    pending.push(encoded);
    pendingBytes += encoded.byteLength;
    if (character === "\n") {
      pendingNewlines += 1;
      line += 1;
      byteInLine = 0;
    } else {
      byteInLine += encoded.byteLength;
    }
    if (pendingNewlines >= SKILL_LIMITS.chunkMaxLines) flush();
  }
  flush();
  return { normalizedText, totalLines, chunks };
}

export function decodeSkillChunk(
  bytes: Uint8Array,
  encoding: SkillChunkEncoding,
) {
  return encoding === "gzip" ? new Uint8Array(gunzipSync(bytes)) : bytes;
}

export function formatSkillReadCursor(cursor: SkillFileReadCursor) {
  return `v1:${cursor.skillFileId}:${cursor.chunkIndex}:${cursor.byteOffset}`;
}

export function parseSkillReadCursor(value: string): SkillFileReadCursor {
  const match = /^v1:([^:]+):(\d+):(\d+)$/.exec(value);
  if (!match) throw new Error("Invalid skill file cursor");
  return {
    skillFileId: match[1] ?? "",
    chunkIndex: Number(match[2]),
    byteOffset: Number(match[3]),
  };
}
