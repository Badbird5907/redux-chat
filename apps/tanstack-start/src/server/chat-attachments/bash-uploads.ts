export const BASH_UPLOADS_DIR = "/uploads";
export const BASH_UPLOADS_MANIFEST_PATH = `${BASH_UPLOADS_DIR}/MANIFEST.json`;

export interface BashUploadSource {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
}

export interface BashUploadManifestEntry {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  path: string;
  idPath: string;
}

export function buildBashUploadManifest(
  attachments: BashUploadSource[],
): BashUploadManifestEntry[] {
  const pathCounts = new Map<string, number>();

  return attachments.map(
    (attachment): BashUploadManifestEntry => ({
      attachmentId: attachment.attachmentId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      path: buildUploadPath(attachment.fileName, pathCounts),
      idPath: `${BASH_UPLOADS_DIR}/${sanitizePathSegment(
        attachment.attachmentId,
      )}`,
    }),
  );
}

export function formatBashUploadSummary(attachments: BashUploadSource[]) {
  const manifest = buildBashUploadManifest(attachments);

  if (manifest.length === 0) {
    return undefined;
  }

  return [
    "User Uploaded Files:",
    ...manifest.map((item) => ` - ${item.fileName}: ${item.path}`),
  ].join("\n");
}

function buildUploadPath(fileName: string, pathCounts: Map<string, number>) {
  const safeName = sanitizePathSegment(fileName);
  const dotIndex = safeName.lastIndexOf(".");
  const baseName = dotIndex > 0 ? safeName.slice(0, dotIndex) : safeName;
  const extension = dotIndex > 0 ? safeName.slice(dotIndex) : "";
  const currentCount = pathCounts.get(safeName) ?? 0;
  const nextCount = currentCount + 1;
  pathCounts.set(safeName, nextCount);

  const uniqueName =
    currentCount === 0 ? safeName : `${baseName}-${nextCount}${extension}`;

  return `${BASH_UPLOADS_DIR}/${uniqueName}`;
}

function sanitizePathSegment(value: string) {
  const sanitized = value
    .trim()
    .replace(/[<>:"/\\|?*]/g, "-")
    .replaceAll(/[\r\n\t]/g, " ")
    .split("")
    .filter((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint === undefined || codePoint >= 32;
    })
    .join("")
    .replace(/\s+/g, " ");

  return sanitized.length > 0 ? sanitized : "upload";
}
