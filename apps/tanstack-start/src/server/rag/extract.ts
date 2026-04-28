import { PDFDocument } from "pdf-lib";
import { estimateTokenCount } from "tokenx";
import { extractText as extractPdfText } from "unpdf";

import type { EmbeddingModality } from "./vector-store";

/**
 * An "extracted chunk" is the unit of work passed to the embedder. Each chunk
 * eventually becomes one row in `attachmentEmbeddings`.
 *
 * For text/code: chunk = ~1000-token windows of the document.
 * For images:    chunk = the whole image (one row per image), embedded as
 *                inline base64 bytes against Gemini's multimodal endpoint.
 * For PDFs:      chunk = a 1–6 page slice, embedded as inline PDF bytes.
 *                We slice because Gemini's embedding endpoint accepts at
 *                most 6 PDF pages per call. `pageNumber` records the first
 *                page of the slice (1-indexed) so citations land in the
 *                right place even when a slice spans pages.
 *
 * Chunks carrying media set `inlineData` to the base64 payload that the
 * embed-client passes straight through to Gemini. Plain text chunks set
 * `text` instead. The two paths converge in `embedItems` downstream.
 */
export interface ExtractedChunk {
  chunkIndex: number;
  modality: EmbeddingModality;
  pageNumber?: number;
  /** Text body to embed and/or to surface in citations. */
  text?: string;
  /**
   * For multimodal chunks (image, pdf_page): the base64-encoded payload that
   * gets sent to Gemini as `inlineData`. Not sent to the vector store —
   * dropped after the embedding call.
   */
  inlineData?: { mimeType: string; data: string };
}

const TEXT_LIKE_MIME_PREFIXES = [
  "text/",
  "application/json",
  "application/javascript",
  "application/xml",
  "application/sql",
  "application/x-yaml",
  "application/x-sh",
  "application/typescript",
];

const TEXT_LIKE_EXTENSIONS = new Set([
  "txt",
  "md",
  "mdx",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "csv",
  "tsv",
  "log",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "css",
  "scss",
  "html",
  "xml",
  "vue",
  "svelte",
  "sh",
  "bash",
  "zsh",
  "ps1",
  "sql",
  "graphql",
  "gql",
  "env",
  "dockerfile",
]);

function isTextLike(mimeType: string, fileName: string): boolean {
  if (TEXT_LIKE_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    return true;
  }
  const ext = fileName.split(".").pop()?.toLowerCase();
  return ext ? TEXT_LIKE_EXTENSIONS.has(ext) : false;
}

const TARGET_TOKENS_PER_CHUNK = 1000;
const OVERLAP_TOKENS = 200;
const MAX_CHARS_PER_CHUNK = 8000; // hard ceiling so token estimates don't run away
const MAX_PDF_PAGES = 100; // global cap across all slices
const PDF_PAGES_PER_SLICE = 6; // Gemini's hard limit per embed call
const MAX_PDF_TEXT_CHARS_PER_SLICE = 6000;

function normalizePdfSliceText(value: string): string | undefined {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return undefined;
  }
  return normalized.slice(0, MAX_PDF_TEXT_CHARS_PER_SLICE);
}

/**
 * Walks the document a sentence/paragraph at a time, packing pieces into
 * windows up to ~`TARGET_TOKENS_PER_CHUNK`. Adjacent windows share
 * ~`OVERLAP_TOKENS` of trailing text so context isn't sliced through a
 * sentence boundary.
 */
function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Split on paragraph breaks first, then sentence-ish breaks if a paragraph
  // is huge. Code files usually have short lines so paragraph splitting
  // collapses cleanly.
  const pieces = trimmed
    .split(/\n{2,}/)
    .flatMap((paragraph) => {
      if (estimateTokenCount(paragraph) <= TARGET_TOKENS_PER_CHUNK) {
        return [paragraph];
      }
      return paragraph.split(/(?<=[.?!])\s+/);
    })
    .map((piece) => piece.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buffer: string[] = [];
  let bufferTokens = 0;

  const flush = () => {
    if (buffer.length === 0) return;
    chunks.push(buffer.join(" "));
  };

  for (const piece of pieces) {
    const pieceTokens = estimateTokenCount(piece);
    if (
      bufferTokens > 0 &&
      (bufferTokens + pieceTokens > TARGET_TOKENS_PER_CHUNK ||
        buffer.join(" ").length + piece.length > MAX_CHARS_PER_CHUNK)
    ) {
      flush();
      // Carry an overlap from the tail of the previous buffer
      const overlap: string[] = [];
      let overlapTokens = 0;
      for (let i = buffer.length - 1; i >= 0; i -= 1) {
        const tokens = estimateTokenCount(buffer[i] ?? "");
        if (overlapTokens + tokens > OVERLAP_TOKENS) break;
        overlap.unshift(buffer[i] ?? "");
        overlapTokens += tokens;
      }
      buffer = [...overlap];
      bufferTokens = overlapTokens;
    }
    buffer.push(piece);
    bufferTokens += pieceTokens;
  }
  flush();

  return chunks;
}

interface ExtractInput {
  mimeType: string;
  fileName: string;
  bytes: ArrayBuffer;
  /**
   * Signed Silo URL for the file. Currently unused (we send inline bytes to
   * Gemini), but kept on the interface so future text/citation rendering
   * has a way to link back to the source.
   */
  downloadUrl: string;
}

export async function extractChunks(
  input: ExtractInput,
): Promise<ExtractedChunk[]> {
  const { mimeType, fileName, bytes } = input;

  if (mimeType === "application/pdf") {
    return extractPdfChunks(bytes);
  }

  if (mimeType.startsWith("image/")) {
    const base64 = Buffer.from(bytes).toString("base64");
    return [
      {
        chunkIndex: 0,
        modality: "image",
        inlineData: { mimeType, data: base64 },
      },
    ];
  }

  if (isTextLike(mimeType, fileName)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const chunks = chunkText(text);
    return chunks.map((body, index) => ({
      chunkIndex: index,
      modality: "text",
      text: body,
    }));
  }

  // Unknown / unsupported MIME type — best effort decode as utf-8.
  // If the result is mostly garbage we drop it (length-based heuristic).
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  if (decoded.replace(/�/g, "").length < decoded.length * 0.7) {
    return [];
  }
  const chunks = chunkText(decoded);
  return chunks.map((body, index) => ({
    chunkIndex: index,
    modality: "text",
    text: body,
  }));
}

/**
 * Slice the PDF into 6-page chunks (Gemini's hard limit per embed call) and
 * emit each as a multimodal `pdf_page` chunk carrying the raw PDF bytes for
 * that slice.
 *
 * We keep the modality literal as `pdf_page` even when a slice spans
 * multiple pages — `pageNumber` records the first page of the slice so
 * downstream citations still land in a usable place.
 */
async function extractPdfChunks(
  bytes: ArrayBuffer,
): Promise<ExtractedChunk[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const totalPages = Math.min(src.getPageCount(), MAX_PDF_PAGES);
  const { text: pageTexts } = await extractPdfText(new Uint8Array(bytes), {
    mergePages: false,
  });
  if (src.getPageCount() > MAX_PDF_PAGES) {
    console.warn(
      `[rag/extract] PDF has ${src.getPageCount()} pages; only indexing the first ${MAX_PDF_PAGES}.`,
    );
  }

  const chunks: ExtractedChunk[] = [];
  let chunkIndex = 0;
  for (let start = 0; start < totalPages; start += PDF_PAGES_PER_SLICE) {
    const end = Math.min(start + PDF_PAGES_PER_SLICE, totalPages);
    const slice = await PDFDocument.create();
    const indices: number[] = [];
    for (let i = start; i < end; i += 1) indices.push(i);
    const copied = await slice.copyPages(src, indices);
    copied.forEach((page) => slice.addPage(page));
    const sliceBytes = await slice.save();
    const data = Buffer.from(sliceBytes).toString("base64");

    chunks.push({
      chunkIndex: chunkIndex,
      modality: "pdf_page",
      pageNumber: start + 1, // 1-indexed; first page of the slice
      text: normalizePdfSliceText(
        pageTexts.slice(start, end).join("\n\n"),
      ),
      inlineData: { mimeType: "application/pdf", data },
    });
    chunkIndex += 1;
  }
  return chunks;
}
