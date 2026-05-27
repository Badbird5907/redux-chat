import { env } from "@/env";

/**
 * Embedding client for Google's Gemini Embedding 2 model, called directly
 * against the Generative Language API.
 *
 * Why direct REST (no SDK):
 *  1. We only need two endpoints (`embedContent` + `batchEmbedContents`).
 *  2. The SDK doesn't add value for our shape (we already build `parts`
 *     arrays in extract.ts) and dragging it in inflates the bundle.
 *
 * Why Gemini (not OpenRouter): OpenRouter's `/embeddings` endpoint only
 * accepts text + image_url parts — no PDF input. Gemini natively handles
 * text, images, AND PDFs (up to 6 pages per request) as inlineData.
 * OpenRouter is still used for chat completions; this file is RAG-only.
 *
 * Limits to honor at the call site:
 *  - 8,192 tokens total per request (input)
 *  - 6 images per request
 *  - 6 PDF pages per request   ← extract.ts slices longer PDFs
 *  - 3,072 max output dims
 *
 * `taskType` is intentionally NOT sent: gemini-embedding-2 doesn't accept
 * it. (That parameter belongs to the older gemini-embedding-001 model.)
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
export const EMBEDDING_MODEL = "gemini-embedding-2";
export const EMBEDDING_DIMS = 3072;

// Per-batch caps. Items count is mostly a courtesy to the API; the byte
// cap is the real limiter — multimodal payloads (PDF / image base64) can
// each be several MB, so we keep total batch payload modest to avoid 413s
// and to keep per-request latency reasonable.
const MAX_BATCH_ITEMS = 16;
const MAX_BATCH_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_RETRIES = 2;

export type EmbedPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface EmbedItem {
  parts: EmbedPart[];
}

export interface MultimodalInput {
  text?: string;
  image?: { mimeType: string; data: string }; // base64
  pdf?: { data: string }; // base64; must be ≤ 6 pages
}

interface BatchEmbedResponse {
  embeddings: { values: number[] }[];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function approxItemBytes(item: EmbedItem): number {
  let size = 0;
  for (const part of item.parts) {
    if ("text" in part) {
      size += part.text.length;
    } else {
      size += part.inlineData.data.length; // base64 length ≈ encoded byte size
    }
  }
  return size;
}

async function embedRequest(items: EmbedItem[]): Promise<number[][]> {
  const url = `${GEMINI_API_BASE}/models/${EMBEDDING_MODEL}:batchEmbedContents`;
  const body = {
    requests: items.map((item) => ({
      model: `models/${EMBEDDING_MODEL}`,
      content: { parts: item.parts },
      outputDimensionality: EMBEDDING_DIMS,
    })),
  };

  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GOOGLE_VERTEX_API_KEY,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        if (response.status >= 500 || response.status === 429) {
          lastError = new Error(
            `Gemini embeddings ${response.status}: ${text.slice(0, 500)}`,
          );
          await sleep(250 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(
          `Gemini embeddings ${response.status}: ${text.slice(0, 500)}`,
        );
      }

      const json = (await response.json()) as BatchEmbedResponse;
      return json.embeddings.map((row) => row.values);
    } catch (error) {
      lastError = error;
      await sleep(250 * Math.pow(2, attempt));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Gemini embeddings failed");
}

/**
 * Low-level: embed an arbitrary list of `EmbedItem`s (each item becomes one
 * vector). Batches by both item count and total payload bytes — multimodal
 * items dominate via the byte cap, text-only items dominate via item count.
 */
export async function embedItems(items: EmbedItem[]): Promise<number[][]> {
  if (items.length === 0) return [];
  const out: number[][] = [];

  let buffer: EmbedItem[] = [];
  let bufferBytes = 0;

  const flush = async () => {
    if (buffer.length === 0) return;
    const vectors = await embedRequest(buffer);
    out.push(...vectors);
    buffer = [];
    bufferBytes = 0;
  };

  for (const item of items) {
    const itemBytes = approxItemBytes(item);
    if (
      buffer.length > 0 &&
      (buffer.length >= MAX_BATCH_ITEMS ||
        bufferBytes + itemBytes > MAX_BATCH_BYTES)
    ) {
      await flush();
    }
    buffer.push(item);
    bufferBytes += itemBytes;
  }
  await flush();

  return out;
}

/**
 * Convenience: embed a list of plain strings as text-only items.
 * Used by the retrieve path (query embedding) and by text-mode chunks.
 */
export async function embedTexts(values: string[]): Promise<number[][]> {
  return embedItems(values.map((v) => ({ parts: [{ text: v }] })));
}

/**
 * Convenience: embed multimodal items. Each item becomes a single embedding
 * representing the joint meaning of its parts.
 *
 * Caller responsibilities:
 *  - Image must be ≤ 6 per item (we send 1 today).
 *  - PDF must be ≤ 6 pages (extract.ts slices longer PDFs).
 *  - Total tokens (counting inline media) must be ≤ 8,192.
 */
export async function embedMultimodal(
  items: MultimodalInput[],
): Promise<number[][]> {
  return embedItems(
    items.map((item) => {
      const parts: EmbedPart[] = [];
      if (item.text) parts.push({ text: item.text });
      if (item.image) {
        parts.push({
          inlineData: {
            mimeType: item.image.mimeType,
            data: item.image.data,
          },
        });
      }
      if (item.pdf) {
        parts.push({
          inlineData: {
            mimeType: "application/pdf",
            data: item.pdf.data,
          },
        });
      }
      return { parts };
    }),
  );
}
