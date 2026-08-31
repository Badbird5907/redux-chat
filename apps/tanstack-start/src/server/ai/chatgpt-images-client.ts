import type { ChatGPTTokens } from "@opencoredev/loginwithchatgpt-core";
import { createCodexFetch } from "@opencoredev/loginwithchatgpt-core";

import { chatGptConfig } from "@/server/byok/oauth/chatgpt";

export type ChatGptImageFormat = "png" | "jpeg" | "webp";

export interface ChatGptImageInput {
  data: string | URL | Blob | ArrayBuffer | Uint8Array;
  mediaType?: `image/${string}`;
  detail?: "auto" | "low" | "high";
}

export interface ChatGptImageOptions {
  prompt: string;
  model?: string;
  imageModel?: string;
  size?: "auto" | `${number}x${number}`;
  quality?: "auto" | "low" | "medium" | "high";
  format?: ChatGptImageFormat;
  compression?: number;
  background?: "auto" | "opaque" | "transparent";
  n?: number;
  partialImages?: number;
  signal?: AbortSignal;
}

export interface ChatGptImageEditOptions extends ChatGptImageOptions {
  images: readonly ChatGptImageInput[];
  mask?: ChatGptImageInput;
  inputFidelity?: "low" | "high";
}

export interface ChatGptGeneratedImage {
  base64: string;
  mediaType: `image/${string}`;
  id?: string;
  revisedPrompt?: string;
}

export interface ChatGptImagesClient {
  generate(options: ChatGptImageOptions): Promise<{
    data: ChatGptGeneratedImage[];
  }>;
  edit(options: ChatGptImageEditOptions): Promise<{
    data: ChatGptGeneratedImage[];
  }>;
}

export class ChatGPTImageError extends Error {
  readonly status?: number;
  readonly body?: string;

  constructor(
    message: string,
    options: { status?: number; body?: string; cause?: unknown } = {},
  ) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "ChatGPTImageError";
    this.status = options.status;
    this.body = options.body;
  }
}

export function createChatGptImagesClient(args: {
  tokens: ChatGPTTokens;
  defaultModel: string;
}): ChatGptImagesClient {
  const accountId = args.tokens.accountId;
  if (!accountId) {
    throw new Error("ChatGPT tokens are missing an account id.");
  }
  const config = chatGptConfig();
  const codexFetch = createCodexFetch({
    config,
    getAuth: () => ({
      accessToken: args.tokens.accessToken,
      accountId,
    }),
  });
  return {
    generate: (options) =>
      runRequests({
        fetch: codexFetch,
        url: `${config.codexBaseUrl}/responses`,
        defaultModel: args.defaultModel,
        options: { ...options, action: "generate" },
      }),
    edit: (options) =>
      runRequests({
        fetch: codexFetch,
        url: `${config.codexBaseUrl}/responses`,
        defaultModel: args.defaultModel,
        options: { ...options, action: "edit" },
      }),
  };
}

type ImageRequest =
  | (ChatGptImageOptions & { action: "generate" })
  | (ChatGptImageEditOptions & { action: "edit" });

async function runRequests(args: {
  fetch: typeof fetch;
  url: string;
  defaultModel: string;
  options: ImageRequest;
}): Promise<{ data: ChatGptGeneratedImage[] }> {
  const count = args.options.n ?? 1;
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new RangeError("Image count must be between 1 and 10.");
  }
  const data = await Promise.all(
    Array.from({ length: count }, () => runRequest(args)),
  );
  return { data };
}

async function runRequest(args: {
  fetch: typeof fetch;
  url: string;
  defaultModel: string;
  options: ImageRequest;
}): Promise<ChatGptGeneratedImage> {
  const format = args.options.format ?? "png";
  const mediaType: `image/${string}` =
    format === "jpeg" ? "image/jpeg" : `image/${format}`;
  const tool: Record<string, unknown> = {
    type: "image_generation",
    action: args.options.action,
  };
  setIfDefined(tool, "model", args.options.imageModel);
  setIfDefined(tool, "size", args.options.size);
  setIfDefined(tool, "quality", args.options.quality);
  setIfDefined(tool, "output_format", args.options.format);
  setIfDefined(tool, "output_compression", args.options.compression);
  setIfDefined(tool, "background", args.options.background);
  setIfDefined(tool, "partial_images", args.options.partialImages);
  if (args.options.action === "edit") {
    setIfDefined(tool, "input_fidelity", args.options.inputFidelity);
    if (args.options.mask) {
      tool.input_image_mask = {
        image_url: await toImageUrl(args.options.mask),
      };
    }
  }

  const input =
    args.options.action === "edit"
      ? [
          {
            role: "user",
            content: [
              { type: "input_text", text: args.options.prompt },
              ...(await Promise.all(
                args.options.images.map(async (image) => ({
                  type: "input_image",
                  image_url: await toImageUrl(image),
                  detail: image.detail ?? "auto",
                })),
              )),
            ],
          },
        ]
      : args.options.prompt;

  const response = await args.fetch(args.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    },
    signal: args.options.signal,
    body: JSON.stringify({
      model: args.options.model ?? args.defaultModel,
      input,
      stream: true,
      tools: [tool],
      tool_choice: { type: "image_generation" },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ChatGPTImageError(
      `ChatGPT image generation failed (${response.status}).`,
      {
        status: response.status,
        ...(detail ? { body: detail } : {}),
      },
    );
  }
  const call = await readImageCall(response);
  return {
    base64: call.result,
    mediaType,
    ...(call.id ? { id: call.id } : {}),
    ...(call.revisedPrompt ? { revisedPrompt: call.revisedPrompt } : {}),
  };
}

async function readImageCall(response: Response): Promise<{
  result: string;
  id?: string;
  revisedPrompt?: string;
}> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const call = findImageCall(await response.json());
    if (call) return call;
    throw new ChatGPTImageError(
      "ChatGPT completed without returning an image.",
    );
  }
  if (!response.body) {
    throw new ChatGPTImageError("ChatGPT image response had no body.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalCall: ReturnType<typeof findImageCall>;
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        finalCall = findImageCall(parseEventData(block)) ?? finalCall;
      }
      if (done) break;
    }
    if (buffer.trim()) {
      finalCall = findImageCall(parseEventData(buffer)) ?? finalCall;
    }
  } finally {
    reader.releaseLock();
  }
  if (!finalCall) {
    throw new ChatGPTImageError(
      "ChatGPT completed without returning an image.",
    );
  }
  return finalCall;
}

function parseEventData(block: string): unknown {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data || data === "[DONE]") return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

function findImageCall(
  value: unknown,
): { result: string; id?: string; revisedPrompt?: string } | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findImageCall(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  if (
    value.type === "image_generation_call" &&
    typeof value.result === "string"
  ) {
    return {
      result: value.result,
      ...(typeof value.id === "string" ? { id: value.id } : {}),
      ...(typeof value.revised_prompt === "string"
        ? { revisedPrompt: value.revised_prompt }
        : {}),
    };
  }
  for (const key of ["item", "output", "response", "data"]) {
    const found = findImageCall(value[key]);
    if (found) return found;
  }
  return undefined;
}

async function toImageUrl(input: ChatGptImageInput): Promise<string> {
  if (input.data instanceof URL) return input.data.toString();
  if (typeof input.data === "string") {
    if (/^(?:https?:|data:)/i.test(input.data)) return input.data;
    if (!input.mediaType) {
      throw new TypeError("Raw image strings require a media type.");
    }
    return `data:${input.mediaType};base64,${input.data}`;
  }
  if (input.data instanceof Blob) {
    const mediaType =
      input.mediaType ??
      (input.data.type.startsWith("image/")
        ? (input.data.type as `image/${string}`)
        : undefined);
    if (!mediaType) throw new TypeError("Image Blob requires a media type.");
    return `data:${mediaType};base64,${Buffer.from(await input.data.arrayBuffer()).toString("base64")}`;
  }
  const bytes =
    input.data instanceof ArrayBuffer
      ? new Uint8Array(input.data)
      : new Uint8Array(
          input.data.buffer,
          input.data.byteOffset,
          input.data.byteLength,
        );
  if (!input.mediaType)
    throw new TypeError("Image bytes require a media type.");
  return `data:${input.mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function setIfDefined(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (value !== undefined) target[key] = value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
