import type { AttachmentSourceRef } from "./types";
import { env } from "@/env";
import { buildAttachmentUrl, getSiloCore } from "@/lib/silo/core.server";

function replaceExtension(fileName: string, nextExtension: string) {
  return fileName.replace(/\.[^.]+$/, "") + nextExtension;
}

export async function convertAttachmentToPdf(input: {
  source: AttachmentSourceRef;
  bytes: ArrayBuffer;
  expiresAt: number;
}) {
  if (!env.DOCUMENT_CONVERTER_URL || !env.DOCUMENT_CONVERTER_BASIC_AUTH) {
    throw new Error("Document converter is not configured");
  }
  console.log(
    `Converting ${input.source.fileName} (${input.source.mimeType}) to PDF`,
  );

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const timeoutMs = env.DOCUMENT_CONVERTER_TIMEOUT_MS ?? 40_000;
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.set(
      "files",
      new Blob([input.bytes], { type: input.source.mimeType }),
      input.source.fileName,
    );

    const response = await fetch(
      `${env.DOCUMENT_CONVERTER_URL.replace(/\/$/, "")}/forms/libreoffice/convert`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${env.DOCUMENT_CONVERTER_BASIC_AUTH}`,
        },
        body: form,
        signal: abortController.signal,
      },
    );
    console.log(
      `PDF conversion response: ${response.status} ${response.statusText}`,
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `PDF conversion failed: ${response.status} ${response.statusText} ${errorText}`,
      );
    }

    const pdfBytes = await response.arrayBuffer();
    const fileName = replaceExtension(input.source.fileName, ".pdf");
    const siloCore = getSiloCore();
    const prepared = await siloCore.prepareUpload({
      uploadStrategy: "self",
      uploadMethod: "put",
      fileExpiry: {
        expiresAt: new Date(input.expiresAt),
      },
      file: {
        fileName,
        size: pdfBytes.byteLength,
        mimeType: "application/pdf",
        isPublic: true,
        serveImage: false,
      },
    });
    console.log(`Uploading converted PDF to Silo`);
    console.log(`Upload URL: ${prepared.file.uploadUrl}`);

    const uploadResponse = await fetch(prepared.file.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
      },
      body: pdfBytes,
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `Failed to upload converted PDF: ${uploadResponse.status} ${uploadResponse.statusText}`,
      );
    }

    console.log(`Uploaded converted PDF to Silo`);
    const url = await buildAttachmentUrl({
      accessKey: prepared.file.accessKey,
      fileName,
      mimeType: "application/pdf",
      isPublic: true,
      serveImage: false,
    });

    return {
      kind: "converted_pdf" as const,
      mimeType: "application/pdf" as const,
      fileName,
      accessKey: prepared.file.accessKey,
      fileKeyId: prepared.file.fileKeyId,
      fileId: undefined,
      expiresAt: prepared.file.expiresAt
        ? new Date(prepared.file.expiresAt).getTime()
        : input.expiresAt,
      url,
    };
  } finally {
    clearTimeout(timeout);
  }
}
