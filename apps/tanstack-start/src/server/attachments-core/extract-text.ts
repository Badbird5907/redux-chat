import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { extractText as extractPdfText } from "unpdf";

import type { AttachmentDerivativeKind, AttachmentSourceRef } from "./types";

const MAX_TEXT_CHARS = 60_000;
const TEXT_CHUNK_SIZE = 12_000;
const TEXT_CHUNK_OVERLAP = 500;
const MAX_SPREADSHEET_SHEETS = 5;
const MAX_SPREADSHEET_ROWS = 200;

function getExtension(fileName: string) {
  return /\.[^.]+$/.exec(fileName)?.[0]?.toLowerCase();
}

function chunkNormalizedText(text: string) {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + TEXT_CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end).trim());
    if (end >= text.length) {
      break;
    }
    start = Math.max(0, end - TEXT_CHUNK_OVERLAP);
  }

  return chunks.filter(Boolean);
}

function normalizePlainText(value: string) {
  return value.replace(/\r\n/g, "\n").replaceAll("\0", "").trim();
}

function withTruncationNotice(
  source: AttachmentSourceRef,
  mode: string,
  text: string,
) {
  if (text.length <= MAX_TEXT_CHARS) {
    return text;
  }

  const header = [
    `[Attached file normalization]`,
    `Name: ${source.fileName}`,
    `Type: ${source.mimeType}`,
    `Mode: ${mode}`,
    `Note: content truncated for chat attachment limits.`,
    "",
  ].join("\n");

  return `${header}${text.slice(0, MAX_TEXT_CHARS)}`;
}

function stripRtfFormatting(value: string) {
  return value
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractOfficeDocumentText(
  source: AttachmentSourceRef,
  bytes: ArrayBuffer,
) {
  const extension = getExtension(source.fileName);

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({
      buffer: Buffer.from(bytes),
    });

    return normalizePlainText(result.value);
  }

  if (extension === ".rtf") {
    return stripRtfFormatting(
      normalizePlainText(Buffer.from(bytes).toString("utf-8")),
    );
  }

  throw new Error(`Unsupported office document format: ${source.fileName}`);
}

function summarizeDelimitedSpreadsheet(
  source: AttachmentSourceRef,
  bytes: ArrayBuffer,
) {
  const text = normalizePlainText(Buffer.from(bytes).toString("utf-8"));
  const rows = text.split("\n").slice(0, MAX_SPREADSHEET_ROWS);

  return [
    `File: ${source.fileName}`,
    `Type: ${source.mimeType}`,
    `Rows included: ${rows.length}`,
    "",
    rows.join("\n"),
  ].join("\n");
}

function summarizeWorkbook(source: AttachmentSourceRef, bytes: ArrayBuffer) {
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer" });
  const blocks: string[] = [`File: ${source.fileName}`, `Type: ${source.mimeType}`];

  const sheetNames = workbook.SheetNames.slice(0, MAX_SPREADSHEET_SHEETS);
  for (const sheetName of sheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      continue;
    }

    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
      worksheet,
      {
        header: 1,
        raw: false,
        blankrows: false,
        defval: "",
      },
    );

    const limitedRows = rows.slice(0, MAX_SPREADSHEET_ROWS);
    const serializedRows = limitedRows.map((row) =>
      row.map((cell) => String(cell ?? "")).join(" | "),
    );

    blocks.push(
      "",
      `Sheet: ${sheetName}`,
      `Rows included: ${serializedRows.length}`,
      serializedRows.join("\n"),
    );
  }

  return blocks.join("\n");
}

async function extractPdfToText(bytes: ArrayBuffer) {
  const result = await extractPdfText(new Uint8Array(bytes));
  return normalizePlainText(
    Array.isArray(result.text) ? result.text.join("\n\n") : result.text,
  );
}

export async function extractTextDerivative(input: {
  source: AttachmentSourceRef;
  kind: Exclude<AttachmentDerivativeKind, "converted_pdf">;
  bytes: ArrayBuffer;
}) {
  const { source, kind, bytes } = input;

  let text: string;
  switch (kind) {
    case "normalized_text": {
      const extension = getExtension(source.fileName);
      if (extension === ".docx" || extension === ".rtf") {
        text = await extractOfficeDocumentText(source, bytes);
      } else {
        text = normalizePlainText(Buffer.from(bytes).toString("utf-8"));
      }
      break;
    }

    case "spreadsheet_text": {
      const extension = getExtension(source.fileName);
      text =
        extension === ".csv" || extension === ".tsv"
          ? summarizeDelimitedSpreadsheet(source, bytes)
          : summarizeWorkbook(source, bytes);
      break;
    }

    case "pdf_text":
      text = await extractPdfToText(bytes);
      break;
  }

  const normalizedText = withTruncationNotice(source, kind, text);

  return {
    kind,
    mimeType: "text/plain",
    fileName: `${source.fileName}.txt`,
    textChunks: chunkNormalizedText(normalizedText),
    charCount: normalizedText.length,
  };
}
