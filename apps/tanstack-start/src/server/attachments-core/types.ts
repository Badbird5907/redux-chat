export type AttachmentDerivativeKind =
  | "normalized_text"
  | "converted_pdf"
  | "pdf_text"
  | "spreadsheet_text";

export type AttachmentDerivativeConsumer = "chat" | "project_indexing";

export interface AttachmentSourceRef {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  accessKey: string;
  isPublic: boolean;
  serveImage: boolean;
  projectId: string;
  environmentId: string;
}

export interface AttachmentDerivativeRequest {
  source: AttachmentSourceRef;
  kind: AttachmentDerivativeKind;
}

export interface ReadyTextDerivative {
  kind: "normalized_text" | "pdf_text" | "spreadsheet_text";
  textChunks: string[];
  charCount: number;
}

export interface ReadyPdfDerivative {
  kind: "converted_pdf";
  mimeType: "application/pdf";
  fileName: string;
  url: string;
  accessKey: string;
  fileKeyId: string;
  textChunks?: string[];
  charCount?: number;
}

export type ReadyAttachmentDerivative =
  | ReadyTextDerivative
  | ReadyPdfDerivative;
