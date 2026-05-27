import type {
  AllowedMimeType,
  ChatAttachmentDeliveryMode,
  ChatAttachmentKind,
  ChatAttachmentPolicy,
  CuratedAttachmentOverride,
  ModelRouteBehavior,
  ModelRouteInfo,
} from "./types";

interface RouteProviderDefaults {
  runtimeProviderKey: string;
  attachmentPolicy: ChatAttachmentPolicy;
}

const TEXT_ATTACHMENT_MIME_TYPES = [
  "text/plain",
  "text/markdown",
  "text/html",
  "text/xml",
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/typescript",
  "application/sql",
  "application/x-sh",
] as const;

const OFFICE_DOCUMENT_MIME_TYPES = [
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/rtf",
  "text/rtf",
] as const;

const SPREADSHEET_MIME_TYPES = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/tab-separated-values",
  "application/csv",
] as const;

const PRESENTATION_MIME_TYPES = [
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
] as const;

const CHAT_ATTACHMENT_KIND_MIME_TYPES: Record<
  ChatAttachmentKind,
  readonly string[]
> = {
  image: ["image"],
  pdf: ["application/pdf"],
  plain_text: TEXT_ATTACHMENT_MIME_TYPES,
  office_document: OFFICE_DOCUMENT_MIME_TYPES,
  spreadsheet: SPREADSHEET_MIME_TYPES,
  presentation: PRESENTATION_MIME_TYPES,
};

const CHAT_ATTACHMENT_KIND_EXTENSIONS: Record<
  ChatAttachmentKind,
  readonly string[]
> = {
  image: [".png", ".jpg", ".jpeg", ".gif", ".webp"],
  pdf: [".pdf"],
  plain_text: [
    ".txt",
    ".md",
    ".mdx",
    ".json",
    ".xml",
    ".html",
    ".csv",
    ".tsv",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".py",
    ".rb",
    ".go",
    ".rs",
    ".java",
    ".c",
    ".cpp",
    ".css",
    ".sql",
    ".yaml",
    ".yml",
    ".toml",
    ".sh",
    ".bash",
    ".ps1",
    ".bat",
    ".cmd",
  ],
  office_document: [".doc", ".docx", ".rtf"],
  spreadsheet: [".csv", ".tsv", ".xls", ".xlsx"],
  presentation: [".ppt", ".pptx"],
};

export const ROUTE_PROVIDER_DEFAULTS: Record<string, RouteProviderDefaults> = {
  openrouter: {
    runtimeProviderKey: "openrouter",
    attachmentPolicy: {
      defaults: {
        image: "native",
        pdf: "native",
        plain_text: "native",
        office_document: "convert_to_pdf",
        spreadsheet: "convert_to_pdf",
        presentation: "convert_to_pdf",
      },
    },
  },
  openai: {
    runtimeProviderKey: "openai",
    attachmentPolicy: {
      defaults: {
        image: "native",
        pdf: "native",
        plain_text: "inline_text",
        office_document: "inline_text",
        spreadsheet: "inline_text",
        presentation: "convert_to_pdf",
      },
      overrides: {
        "ext:.doc": "convert_to_pdf",
      },
    },
  },
  anthropic: {
    runtimeProviderKey: "anthropic",
    attachmentPolicy: {
      defaults: {
        image: "native",
        pdf: "native",
        plain_text: "native",
        office_document: "inline_text",
        spreadsheet: "inline_text",
        presentation: "convert_to_pdf",
      },
      overrides: {
        "ext:.doc": "convert_to_pdf",
      },
    },
  },
  google: {
    runtimeProviderKey: "google",
    attachmentPolicy: {
      defaults: {
        image: "native",
        pdf: "native",
        plain_text: "native",
        office_document: "convert_to_pdf",
        spreadsheet: "convert_to_pdf",
        presentation: "convert_to_pdf",
      },
    },
  },
  vertex: {
    runtimeProviderKey: "vertex",
    attachmentPolicy: {
      defaults: {
        image: "native",
        pdf: "native",
        plain_text: "native",
        office_document: "convert_to_pdf",
        spreadsheet: "convert_to_pdf",
        presentation: "convert_to_pdf",
      },
    },
  },
};

export function mergeModelRouteBehavior(
  providerId: string,
  curatedProviderOverride?: ModelRouteBehavior,
  modelOverride?: ModelRouteBehavior,
): ModelRouteBehavior {
  const providerDefaults = ROUTE_PROVIDER_DEFAULTS[providerId];

  return {
    runtimeProviderKey:
      modelOverride?.runtimeProviderKey ??
      curatedProviderOverride?.runtimeProviderKey ??
      providerDefaults?.runtimeProviderKey,
    attachmentPolicy: {
      defaults: {
        ...providerDefaults?.attachmentPolicy.defaults,
        ...curatedProviderOverride?.attachmentPolicy?.defaults,
        ...modelOverride?.attachmentPolicy?.defaults,
      },
      overrides: {
        ...providerDefaults?.attachmentPolicy.overrides,
        ...curatedProviderOverride?.attachmentPolicy?.overrides,
        ...modelOverride?.attachmentPolicy?.overrides,
      },
    },
    useOpenAICompatible:
      modelOverride?.useOpenAICompatible ??
      curatedProviderOverride?.useOpenAICompatible ??
      false,
  };
}

function toLowercaseExtension(fileName: string) {
  const extension = /\.[^.]+$/.exec(fileName)?.[0]?.toLowerCase();
  return extension;
}

export function classifyChatAttachment(input: {
  fileName: string;
  mimeType: string;
}): ChatAttachmentKind | undefined {
  const mimeType = input.mimeType.trim().toLowerCase();
  const extension = toLowercaseExtension(input.fileName);

  if (mimeType.startsWith("image/")) {
    return "image";
  }

  if (mimeType === "application/pdf" || extension === ".pdf") {
    return "pdf";
  }

  if (
    extension &&
    CHAT_ATTACHMENT_KIND_EXTENSIONS.office_document.includes(extension)
  ) {
    return "office_document";
  }

  if (
    extension &&
    CHAT_ATTACHMENT_KIND_EXTENSIONS.spreadsheet.includes(extension)
  ) {
    return "spreadsheet";
  }

  if (
    extension &&
    CHAT_ATTACHMENT_KIND_EXTENSIONS.presentation.includes(extension)
  ) {
    return "presentation";
  }

  if (
    TEXT_ATTACHMENT_MIME_TYPES.includes(
      mimeType as (typeof TEXT_ATTACHMENT_MIME_TYPES)[number],
    )
  ) {
    return "plain_text";
  }

  if (
    extension &&
    CHAT_ATTACHMENT_KIND_EXTENSIONS.plain_text.includes(extension)
  ) {
    return "plain_text";
  }

  return undefined;
}

export function resolveAttachmentDeliveryMode(
  route: Pick<ModelRouteInfo, "id" | "behavior">,
  input: { fileName: string; mimeType: string },
): ChatAttachmentDeliveryMode | undefined {
  const kind = classifyChatAttachment(input);
  if (!kind) {
    return undefined;
  }

  const policy = route.behavior.attachmentPolicy;
  const mimeType = input.mimeType.trim().toLowerCase();
  const extension = toLowercaseExtension(input.fileName);

  return (
    (mimeType ? policy?.overrides?.[`mime:${mimeType}`] : undefined) ??
    (extension ? policy?.overrides?.[`ext:${extension}`] : undefined) ??
    policy?.overrides?.[`kind:${kind}`] ??
    policy?.defaults?.[kind]
  );
}

export function getRouteAcceptedMimeTypes(
  route: Pick<ModelRouteInfo, "behavior">,
  override?: CuratedAttachmentOverride,
): AllowedMimeType[] {
  const mimeTypes = new Set<AllowedMimeType>();
  const defaults = route.behavior.attachmentPolicy?.defaults ?? {};

  for (const kind of Object.keys(defaults) as ChatAttachmentKind[]) {
    for (const mimeType of CHAT_ATTACHMENT_KIND_MIME_TYPES[kind]) {
      mimeTypes.add(mimeType);
    }
  }

  for (const extraMimeType of override?.extraMimeTypes ?? []) {
    mimeTypes.add(extraMimeType);
  }

  return [...mimeTypes];
}

export function getRouteAcceptedExtensions(
  route: Pick<ModelRouteInfo, "behavior">,
  override?: CuratedAttachmentOverride,
) {
  const accepted = new Set<string>();
  const defaults = route.behavior.attachmentPolicy?.defaults ?? {};

  for (const kind of Object.keys(defaults) as ChatAttachmentKind[]) {
    if (kind === "image") {
      accepted.add("image/*");
      continue;
    }

    for (const extension of CHAT_ATTACHMENT_KIND_EXTENSIONS[kind]) {
      accepted.add(extension);
    }
  }

  for (const extraAccept of override?.extraAccept ?? []) {
    accepted.add(extraAccept);
  }

  return [...accepted];
}

export function getRouteAttachmentBehavior(route: ModelRouteInfo) {
  return route.behavior;
}
