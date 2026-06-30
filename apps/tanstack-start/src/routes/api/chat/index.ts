import type { RetrievedChunk } from "@/server/rag/vector-store";
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  generateImage,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { checkBotId } from "botid/server";
import { createResumableStreamContext } from "resumable-stream/generic";
import { z } from "zod";

import type { ThinkingLevel } from "@redux/shared/models";
import { api } from "@redux/backend/convex/_generated/api";
import { getChatModelConfig } from "@redux/shared/models";
import {
  getEnabledToolSettings,
  isToolEnabled,
  normalizeMessageSettings,
} from "@redux/types";

import { env } from "@/env";
import { createToolRuntime } from "@/lib/ai/tools";
import {
  downloadBashFsState,
  serializeBashFs,
  uploadBashFsState,
} from "@/lib/ai/tools/bash-fs-persistence";
import { formatProjectKnowledgeChunk } from "@/lib/ai/tools/project-knowledge-format";
import { selectProjectMediaAttachmentIds } from "@/lib/ai/tools/project-knowledge-media";
import {
  fetchAuthAction,
  fetchAuthMutation,
  fetchAuthQuery,
  getRequestUserIdFromHeaders,
} from "@/lib/auth/server";
import {
  buildAttachmentDownloadUrl,
  buildAttachmentUrl,
  makeAttachmentPublic,
} from "@/lib/silo/core.server";
import { createUpstashPubSub } from "@/lib/upstash-resumable-stream";
import { throttle } from "@/lib/utils/throttle";
import { storeGeneratedImage } from "@/server/ai/generated-images";
import {
  resolveAiSdkImageModel,
  resolveAiSdkModel,
} from "@/server/ai/model-runtime";
import { identifyPostHogUser, withPostHogTracing } from "@/server/ai/telemetry";
import { resolveServingAttachment } from "@/server/attachments-core/resolve-serving-attachment";
import { materializeAttachmentsForRoute } from "@/server/chat-attachments/materialize";
import { retrieveProjectContext } from "@/server/rag/retrieve";
import { getPostHogClient } from "@/utils/posthog-server";

const disabledToolSchema = z.literal(false);
const emptyToolSchema = z.union([z.object({}), disabledToolSchema, z.null()]);

const requestBody = z.object({
  fileIds: z.array(z.string()),
  threadId: z.string(),
  assistantMessageId: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      parts: z.array(z.custom<UIMessagePart<UIDataTypes, UITools>>()),
    }),
  ),
  settings: z.object({
    model: z.string(),
    thinkingLevel: z.enum(["instant", "low", "medium", "high"]).optional(),
    instructionId: z.string().optional(),
    tools: z
      .object({
        search: emptyToolSchema.optional(),
        bashWorkspace: emptyToolSchema.optional(),
        analysisWorkspace: z
          .union([
            z.object({
              syncUploads: z.boolean().optional(),
            }),
            disabledToolSchema,
            z.null(),
          ])
          .optional(),
        mcpServers: z
          .union([
            z.object({
              serverIds: z.array(z.string()).optional().nullable(),
            }),
            disabledToolSchema,
            z.null(),
          ])
          .optional(),
        imageGeneration: z
          .union([
            z.object({
              modelId: z.string().optional().nullable(),
            }),
            disabledToolSchema,
            z.null(),
          ])
          .optional(),
      })
      .optional()
      .nullable(),
  }),
  model: z.string(),
  id: z.string(),
  trigger: z.enum(["submit-message", "regenerate-message"]),
  clientId: z.string().optional(),
});

type ChatRequestMessage = z.infer<typeof requestBody>["messages"][number];
type AiSdkReasoning = "none" | "low" | "medium" | "high";
const MIN_GENERATION_CREDIT_FLOOR = 10;
type StreamTextProviderOptions = NonNullable<
  Parameters<typeof streamText>[0]["providerOptions"]
>;

function resolveProviderOptions(
  runtimeProviderKey: string,
): StreamTextProviderOptions | undefined {
  if (runtimeProviderKey === "anthropic") {
    return {
      anthropic: {
        cacheControl: { type: "ephemeral" },
      } satisfies AnthropicLanguageModelOptions,
    };
  }

  return undefined;
}

function resolveReasoningParam(
  supportsReasoning: boolean,
  allowed: readonly ThinkingLevel[],
  requested: ThinkingLevel | undefined,
  fallback: ThinkingLevel | undefined,
): AiSdkReasoning | undefined {
  if (!supportsReasoning || allowed.length === 0) {
    return undefined;
  }

  const selected =
    requested && allowed.includes(requested) ? requested : fallback;

  if (!selected || !allowed.includes(selected)) {
    return undefined;
  }

  return selected === "instant" ? "none" : selected;
}

const ENABLE_PROJECT_RAG_PREFETCH = true;

const BASE_SYSTEM_PROMPT = `You are Redux.chat.

You can use Markdown for clear formatting, including fenced code blocks for code.
For math, use LaTeX with $...$ for inline math and $$...$$ for display math.

You may have access to two separate sandbox environments. They have separate filesystems — files do NOT transfer between them, so pick one per task:
- Bash: a fast, in-memory shell and filesystem. No internet and no Python. Use it for quick reading, searching, and transforming uploaded files and other lightweight shell work. Uploaded file metadata is listed at /uploads/MANIFEST.json and uploaded files are already available at their listed /uploads paths. If a user asks about an uploaded text, markdown, code, CSV, or document file, read it from /uploads rather than assuming it was pasted into the chat.
- analysis_workspace: a full Linux sandbox (cloud VM) with internet access that runs Python or bash (set language: "bash" for shell). Use it when you need Python, plotting, package installs, system tools, or network access. Pass specific attachmentIds when you need uploaded files there; they sync into /uploads.

To make a file from a sandbox available to the user, call present_file with its path (and source when both sandboxes are enabled). Images are embedded inline; other files appear as download cards.`;

interface ModelAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  accessKey: string;
  fileKeyId: string;
  isPublic: boolean;
  serveImage: boolean;
  projectId: string;
  environmentId: string;
}

async function resolveModelAttachments(attachmentIds: string[]) {
  if (attachmentIds.length === 0) {
    return [];
  }

  const attachments = await fetchAuthQuery(
    api.functions.attachments.listByIds,
    {
      attachmentIds,
    },
  );

  const servingAttachments = await Promise.all(
    attachments.map((attachment) => resolveServingAttachment(attachment)),
  );

  return Promise.all(
    servingAttachments.flatMap((attachment) =>
      attachment.expired
        ? []
        : [
            (async (): Promise<ModelAttachment> => ({
              attachmentId: attachment.attachmentId,
              fileName: attachment.fileName,
              mimeType: attachment.mimeType,
              size: attachment.size,
              url: await buildAttachmentUrl({
                accessKey: attachment.accessKey,
                fileName: attachment.fileName,
                mimeType: attachment.mimeType,
                isPublic: attachment.isPublic,
                serveImage: attachment.serveImage,
              }),
              accessKey: attachment.accessKey,
              fileKeyId: attachment.fileKeyId,
              isPublic: attachment.isPublic,
              serveImage: attachment.serveImage,
              projectId: attachment.projectId,
              environmentId: attachment.environmentId,
            }))(),
          ],
    ),
  );
}

async function getAttachmentsByMessageId(threadId: string) {
  const threadMessages = await fetchAuthQuery(
    api.functions.threads.getThreadMessages,
    { threadId },
  );

  const attachmentIds = Array.from(
    new Set(
      threadMessages.flatMap((message) =>
        message.attachments.map((attachment) => attachment.attachmentId),
      ),
    ),
  );

  if (attachmentIds.length === 0) {
    return new Map<string, ModelAttachment[]>();
  }

  const attachmentsById = new Map<string, ModelAttachment>(
    (await resolveModelAttachments(attachmentIds)).map((attachment) => [
      attachment.attachmentId,
      attachment,
    ]),
  );

  const attachmentsByMessageId = new Map<string, ModelAttachment[]>();

  for (const message of threadMessages) {
    const resolvedAttachments = message.attachments.flatMap((attachment) => {
      const resolvedAttachment = attachmentsById.get(attachment.attachmentId);
      return resolvedAttachment ? [resolvedAttachment] : [];
    });

    if (resolvedAttachments.length > 0) {
      attachmentsByMessageId.set(message.id, resolvedAttachments);
    }
  }

  return attachmentsByMessageId;
}

function getLastUserMessageId(messages: ChatRequestMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message.id;
    }
  }

  return undefined;
}

function extractTextFromMessage(
  message: ChatRequestMessage | undefined,
): string {
  if (!message) return "";
  return message.parts
    .flatMap((part) => {
      if (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text ? [part.text] : [];
      }
      return [];
    })
    .join("\n")
    .trim();
}

function getLastUserMessage(messages: ChatRequestMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message;
    }
  }
  return undefined;
}

function formatChunksAsContext(chunks: RetrievedChunk[]): string {
  const header =
    "You have access to the following excerpts from this project's files. " +
    "If a chunk's content is not relevant, ignore it.";

  const blocks = chunks.map((chunk, _index) => {
    return formatProjectKnowledgeChunk(chunk, {
      tag: undefined,
      includeFilePrefix: true,
      emptyText: "(no text)",
      imageText: "(image — refer to it by file name when relevant)",
    });
  });

  return [header, "", ...blocks].join("\n\n");
}

function mergeAttachments(
  existing: ModelAttachment[] | undefined,
  incoming: ModelAttachment[],
) {
  const mergedById = new Map(
    existing?.map(
      (attachment) => [getAttachmentDedupeKey(attachment), attachment] as const,
    ),
  );

  for (const attachment of incoming) {
    mergedById.set(getAttachmentDedupeKey(attachment), attachment);
  }

  return Array.from(mergedById.values());
}

function getAttachmentDedupeKey(attachment: ModelAttachment) {
  return attachment.fileKeyId || attachment.attachmentId;
}

function getToolAttachments(
  attachmentsByMessageId: Map<string, ModelAttachment[]>,
) {
  const attachments = Array.from(
    new Map(
      Array.from(attachmentsByMessageId.values())
        .flat()
        .map(
          (attachment) =>
            [getAttachmentDedupeKey(attachment), attachment] as const,
        ),
    ).values(),
  );

  return attachments.map((attachment) => {
    return {
      attachmentId: attachment.attachmentId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      size: attachment.size,
      getDownloadUrl: () => ensureAttachmentDownloadUrl(attachment),
      download: async () => {
        const response = await fetch(
          await ensureAttachmentDownloadUrl(attachment),
        );
        if (!response.ok) {
          throw new Error(
            `Failed to download uploaded file ${attachment.fileName}: HTTP ${response.status}`,
          );
        }

        return new Uint8Array(await response.arrayBuffer());
      },
    };
  });
}

async function ensureAttachmentDownloadUrl(attachment: ModelAttachment) {
  if (!attachment.isPublic) {
    await makeAttachmentPublic({
      projectId: attachment.projectId,
      environmentId: attachment.environmentId,
      fileKeyId: attachment.fileKeyId,
      serveImage: attachment.serveImage,
    });
  }

  return buildAttachmentDownloadUrl({
    accessKey: attachment.accessKey,
    fileName: attachment.fileName,
    isPublic: true,
  });
}

function getErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    if (typeof record.responseBody === "string") {
      const responseBodyText = record.responseBody;
      try {
        const responseBody = JSON.parse(responseBodyText) as unknown;
        const responseMessage = getErrorMessage(responseBody);
        if (responseMessage !== "Unknown chat stream error") {
          return responseMessage;
        }
      } catch {
        return responseBodyText;
      }
    }
    if (Array.isArray(record.errors)) {
      const messages = record.errors
        .map((item): string | undefined => {
          if (typeof item !== "object" || item === null) {
            return undefined;
          }
          const errorRecord = item as Record<string, unknown>;
          return typeof errorRecord.message === "string"
            ? errorRecord.message
            : undefined;
        })
        .filter((message): message is string => Boolean(message));
      if (messages.length > 0) {
        return messages.join("\n");
      }
    }
    if (typeof record.message === "string") {
      return record.message;
    }
    if (record.error !== error) {
      const nestedMessage = getErrorMessage(record.error);
      if (nestedMessage !== "Unknown chat stream error") {
        return nestedMessage;
      }
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    const serialized = JSON.stringify(error) as string | undefined;
    return serialized ?? "Unknown chat stream error";
  } catch {
    return "Unknown chat stream error";
  }
}

function isPersistableAssistantPart(part: unknown) {
  return !(
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "error"
  );
}

const MAX_PERSISTED_ASSISTANT_PARTS_BYTES = 900 * 1024;
const MAX_PERSISTED_TEXT_CHARS = 200_000;
const MAX_PERSISTED_TOOL_STRING_CHARS = 16_000;
const MAX_COMPACT_TOOL_STRING_CHARS = 1_000;
const MAX_PERSISTED_ARRAY_ITEMS = 50;
const MAX_COMPACT_ARRAY_ITEMS = 10;
const BYTE_ARRAY_SAMPLE_SIZE = 256;

interface SanitizePersistenceOptions {
  compact?: boolean;
  inToolPart?: boolean;
  key?: string;
  seen?: WeakSet<object>;
}

function sanitizeAssistantPartsForPersistence(
  parts: UIMessagePart<UIDataTypes, UITools>[],
) {
  const sanitized = parts.map((part) =>
    sanitizePersistedValue(part),
  ) as UIMessagePart<UIDataTypes, UITools>[];

  if (getJsonByteLength(sanitized) <= MAX_PERSISTED_ASSISTANT_PARTS_BYTES) {
    return sanitized;
  }

  return parts.map((part) =>
    sanitizePersistedValue(part, { compact: true }),
  ) as UIMessagePart<UIDataTypes, UITools>[];
}

function sanitizePersistedValue(
  value: unknown,
  options: SanitizePersistenceOptions = {},
): unknown {
  if (value == null) {
    return value;
  }

  if (typeof value === "string") {
    return sanitizePersistedString(value, options);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return omittedBinaryValue(value.byteLength);
  }

  if (ArrayBuffer.isView(value)) {
    return omittedBinaryValue(value.byteLength);
  }

  if (Array.isArray(value)) {
    if (isLikelyByteArray(value)) {
      return omittedBinaryValue(value.length);
    }

    const maxItems = options.compact
      ? MAX_COMPACT_ARRAY_ITEMS
      : MAX_PERSISTED_ARRAY_ITEMS;
    const items = value.slice(0, maxItems).map((item) =>
      sanitizePersistedValue(item, {
        ...options,
        key: undefined,
      }),
    );

    if (value.length > maxItems) {
      items.push({
        omitted: true,
        omittedItems: value.length - maxItems,
        reason: "Additional tool result items are not stored in chat history.",
      });
    }

    return items;
  }

  if (typeof value !== "object") {
    return undefined;
  }

  const seen = options.seen ?? new WeakSet<object>();
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);

  const record = value as Record<string, unknown>;
  const inToolPart =
    options.inToolPart ??
    (typeof record.type === "string" && record.type.startsWith("tool-"));
  const output: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(record)) {
    const sanitized = sanitizePersistedValue(item, {
      ...options,
      inToolPart,
      key,
      seen,
    });
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }

  return output;
}

function sanitizePersistedString(
  value: string,
  options: SanitizePersistenceOptions,
) {
  const maxLength = options.compact
    ? options.inToolPart
      ? MAX_COMPACT_TOOL_STRING_CHARS
      : MAX_PERSISTED_TOOL_STRING_CHARS
    : options.inToolPart
      ? MAX_PERSISTED_TOOL_STRING_CHARS
      : MAX_PERSISTED_TEXT_CHARS;

  if (value.length <= maxLength) {
    return value;
  }

  const keyText = options.key ? ` for \`${options.key}\`` : "";
  return `[Large value omitted from saved chat history${keyText}: ${value.length.toLocaleString()} characters. Re-run the tool or use present_file for downloadable files.]`;
}

function isLikelyByteArray(value: unknown[]) {
  if (value.length <= BYTE_ARRAY_SAMPLE_SIZE) {
    return false;
  }

  return value
    .slice(0, BYTE_ARRAY_SAMPLE_SIZE)
    .every(
      (item) =>
        typeof item === "number" &&
        Number.isInteger(item) &&
        item >= 0 &&
        item <= 255,
    );
}

function omittedBinaryValue(byteLength: number) {
  return {
    omitted: true,
    byteLength,
    reason:
      "Binary tool output is not stored in chat history. Use present_file for downloadable files.",
  };
}

function getJsonByteLength(value: unknown) {
  const json = JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
  return new TextEncoder().encode(json).byteLength;
}

export const Route = createFileRoute("/api/chat/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botVerification = await checkBotId();
        if (botVerification.isBot) {
          return new Response("Access denied", { status: 403 });
        }

        const requestUserId = await getRequestUserIdFromHeaders(
          request.headers,
        );
        if (!requestUserId) {
          return new Response("Unauthorized", { status: 401 });
        }

        const parsedBody = requestBody.parse(await request.json());

        const {
          threadId,
          assistantMessageId,
          messages,
          fileIds,
          clientId,
          settings: rawSettings,
        } = parsedBody;
        const settings = normalizeMessageSettings(rawSettings);
        const isSearchEnabled = isToolEnabled(settings.tools, "search");
        const isBashWorkspaceEnabled = isToolEnabled(
          settings.tools,
          "bashWorkspace",
        );
        const enabledMcpServerIds =
          getEnabledToolSettings(settings.tools, "mcpServers")?.serverIds ?? [];
        console.log("Received request:", {
          threadId,
          assistantMessageId,
          clientId,
          model: settings.model,
          isSearchEnabled,
          enabledMcpServerIds,
        });

        // Preflight gate: read the Convex credit ledger directly (cheap query)
        // and refresh subscription state to know if overage is allowed. The
        // refresh action also idempotently grants the free monthly allowance
        // on the first read each month.
        const [billingSnapshot, billingState, userBillingInfo] =
          await Promise.all([
            fetchAuthQuery(api.functions.billing.getCurrentBillingState, {}),
            fetchAuthAction(
              api.functions.billing.refreshCurrentUserBillingState,
              {},
            ),
            fetchAuthQuery(api.functions.user.getCurrentUserBillingInfo, {}),
          ]);

        identifyPostHogUser(requestUserId, {
          email: userBillingInfo.email,
          name: userBillingInfo.name,
        });
        const spendableCredits = billingState.spendableCredits;
        if (
          spendableCredits < MIN_GENERATION_CREDIT_FLOOR &&
          !billingState.overageAllowed
        ) {
          await fetchAuthMutation(api.functions.threads.internal_failStream, {
            secret: env.INTERNAL_CONVEX_SECRET,
            userId: requestUserId,
            threadId,
            assistantMessageId,
            error: "Insufficient credits to start generation.",
          });

          getPostHogClient()?.capture({
            distinctId: requestUserId,
            event: "out_of_credits",
            properties: {
              tier: billingSnapshot.tier,
              spendable_credits: spendableCredits,
              model: settings.model,
            },
          });

          return new Response(
            JSON.stringify({
              error: "out_of_credits",
              tier: billingSnapshot.tier,
              spendableCredits,
              availableCredits: billingState.availableCredits,
              minimumRequiredCredits: MIN_GENERATION_CREDIT_FLOOR,
            }),
            {
              status: 402,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        let cleanupTools: (() => Promise<void>) | undefined;
        let lastStreamErrorMessage: string | undefined;
        let streamRefused = false;
        const reportStreamFailure = async (error: unknown) => {
          const errorMessage = getErrorMessage(error).slice(0, 1000);
          try {
            await fetchAuthMutation(api.functions.threads.internal_failStream, {
              secret: env.INTERNAL_CONVEX_SECRET,
              userId: requestUserId,
              threadId,
              assistantMessageId,
              error: errorMessage,
            });
          } catch (reportError) {
            console.error("Failed to mark chat stream as failed", reportError);
          }

          return errorMessage;
        };

        try {
          const attachmentsByMessageId =
            await getAttachmentsByMessageId(threadId);
          const lastUserMessageId = getLastUserMessageId(messages);

          // If this thread belongs to a Project, fetch its shared instructions
          // and prepend them as a system message to the model. Also retrieve
          // RAG context from the project's indexed file library.
          let projectInstructions: string | undefined;
          let selectedInstructionPrompt: string | undefined;
          let projectContextBlock: string | undefined;
          let projectToolInstruction: string | undefined;
          let chatProjectId: string | undefined;
          let threadUserId: string | undefined;
          let bashFsState: { accessKey: string; fileKeyId: string } | undefined;
          try {
            const thread = await fetchAuthQuery(
              api.functions.threads.getThread,
              { threadId },
            );
            bashFsState = thread?.bashFsState ?? undefined;
            if (thread?.chatProjectId) {
              threadUserId = thread.userId;
              chatProjectId = thread.chatProjectId;
              const project = await fetchAuthQuery(
                api.functions.projects.getProject,
                { projectId: thread.chatProjectId },
              );
              const instructions = project?.instructions?.trim();
              if (instructions) {
                projectInstructions = instructions;
              }
            }
            const selectedInstruction = await fetchAuthQuery(
              api.functions.instructions.getEffectiveInstruction,
              { instructionId: thread?.settings.instructionId },
            );
            const prompt =
              selectedInstruction === null
                ? undefined
                : selectedInstruction.prompt.trim();
            if (prompt) {
              selectedInstructionPrompt = prompt;
            }
          } catch (error) {
            console.error("Failed to load chat instructions", error);
          }

          if (chatProjectId) {
            projectToolInstruction = [
              "This chat belongs to a project with an indexed knowledge base.",
              "When the user asks about project files, PDFs, images, screenshots, uploaded documents, or anything that likely refers to project material, proactively call `search_project_knowledge` before answering.",
              "If the user's request is ambiguous, underspecified, or you do not know what they are referring to, use `search_project_knowledge` first to ground the conversation in the project knowledge base.",
              "Do not ask the user to paste, quote, clarify, or re-upload project material until you have first used `search_project_knowledge` and checked its results.",
              "If the tool returns relevant excerpts or raw files, use them to answer directly.",
            ].join("\n");
          }

          // #region project rag stuff
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          if (chatProjectId && ENABLE_PROJECT_RAG_PREFETCH) {
            const queryText = extractTextFromMessage(
              getLastUserMessage(messages),
            );
            if (queryText) {
              try {
                const { chunks } = await retrieveProjectContext({
                  userId: requestUserId,
                  chatProjectId,
                  query: queryText,
                  k: 6,
                });
                if (chunks.length > 0) {
                  projectContextBlock = formatChunksAsContext(chunks);

                  if (lastUserMessageId) {
                    const projectMediaAttachmentIds =
                      selectProjectMediaAttachmentIds(chunks, settings.model, {
                        requireMissingText: true,
                      });

                    if (projectMediaAttachmentIds.length > 0) {
                      attachmentsByMessageId.set(
                        lastUserMessageId,
                        mergeAttachments(
                          attachmentsByMessageId.get(lastUserMessageId),
                          await resolveModelAttachments(
                            projectMediaAttachmentIds,
                          ),
                        ),
                      );
                    }
                  }
                }
              } catch (error) {
                console.error("RAG retrieval failed", error);
              }
            }
          }
          // #endregion project rag stuff

          if (lastUserMessageId && fileIds.length > 0) {
            attachmentsByMessageId.set(
              lastUserMessageId,
              mergeAttachments(
                attachmentsByMessageId.get(lastUserMessageId),
                await resolveModelAttachments(fileIds),
              ),
            );
          }

          const enabledMcpServers =
            enabledMcpServerIds.length > 0
              ? await fetchAuthQuery(api.functions.mcpServers.getByIds, {
                  serverIds: enabledMcpServerIds,
                })
              : [];

          // Restore previous bash FS state if available
          let previousBashFiles:
            | Record<string, string | Uint8Array>
            | undefined;
          if (isBashWorkspaceEnabled && bashFsState) {
            try {
              previousBashFiles =
                (await downloadBashFsState(bashFsState)) ?? undefined;
            } catch (error) {
              console.warn("[bash-fs] Failed to restore FS state", error);
            }
          }

          const toolRuntime = await createToolRuntime(settings, {
            attachments: getToolAttachments(attachmentsByMessageId),
            mcpServers: enabledMcpServers,
            projectContext:
              chatProjectId && threadUserId
                ? {
                    chatProjectId,
                    userId: threadUserId,
                  }
                : undefined,
            generationContext: {
              userId: requestUserId,
              threadId,
              messageId: assistantMessageId,
            },
            previousBashFiles,
          });
          let didCleanupTools = false;
          cleanupTools = async () => {
            if (didCleanupTools) {
              return;
            }

            didCleanupTools = true;

            // Persist bash FS state to Silo (fire-and-forget via waitUntil)
            if (isBashWorkspaceEnabled) {
              const bashFs = toolRuntime.getBashFs();
              if (bashFs) {
                waitUntil(
                  (async () => {
                    try {
                      const serialized = await serializeBashFs(bashFs);
                      if (serialized) {
                        const ref = await uploadBashFsState(serialized.bytes, {
                          threadId,
                          userId: requestUserId,
                          fileCount: serialized.fileCount,
                        });
                        await fetchAuthMutation(
                          api.functions.threads.internal_updateBashFsState,
                          {
                            secret: env.INTERNAL_CONVEX_SECRET,
                            userId: requestUserId,
                            threadId,
                            bashFsState: ref,
                          },
                        );
                      }
                    } catch (error) {
                      console.error(
                        "[bash-fs] Failed to persist FS state",
                        error,
                      );
                    }
                  })(),
                );
              }
            }

            await toolRuntime.cleanup();
          };

          const selectedModelConfig = getChatModelConfig(settings.model);
          if (selectedModelConfig?.supports.imageOutput) {
            await fetchAuthQuery(
              api.functions.threads.internal_validateGenerationMessage,
              {
                secret: env.INTERNAL_CONVEX_SECRET,
                userId: requestUserId,
                messageId: assistantMessageId,
                threadId,
              },
            );
            const queryText = extractTextFromMessage(
              getLastUserMessage(messages),
            );
            if (!queryText) {
              throw new Error("Image generation requires a text prompt.");
            }
            const imageModel = resolveAiSdkImageModel(settings.model);
            const imageAbortController = new AbortController();
            const stream = createUIMessageStream({
              originalMessages: messages,
              generateId: () => assistantMessageId,
              onError: (error) => {
                const errorMessage = getErrorMessage(error).slice(0, 1000);
                void reportStreamFailure(error);
                return errorMessage;
              },
              execute: async ({ writer }) => {
                const startedAt = Date.now();
                try {
                  writer.write({
                    type: "start",
                    messageId: assistantMessageId,
                    messageMetadata: { createdAt: startedAt },
                  } as never);
                  writer.write({
                    type: "data-generated-image",
                    data: {
                      type: "data-generated-image",
                      status: "generating",
                      prompt: queryText,
                      modelId: settings.model,
                      provider: imageModel.route.provider,
                      createdAt: startedAt,
                    },
                  } as never);

                  const result = await generateImage({
                    model: imageModel.model,
                    prompt: queryText,
                    abortSignal: imageAbortController.signal,
                  });
                  const imagePart = await storeGeneratedImage({
                    userId: requestUserId,
                    threadId,
                    messageId: assistantMessageId,
                    modelId: settings.model,
                    route: imageModel.route,
                    prompt: queryText,
                    image: result.image,
                  });
                  writer.write({
                    type: "data-generated-image",
                    data: imagePart,
                  } as never);
                  writer.write({
                    type: "finish",
                  } as never);

                  const parts = [imagePart] as unknown as UIMessagePart<
                    UIDataTypes,
                    UITools
                  >[];

                  await fetchAuthMutation(
                    api.functions.threads.internal_updateMessageUsage,
                    {
                      secret: env.INTERNAL_CONVEX_SECRET,
                      userId: requestUserId,
                      threadId,
                      messageId: assistantMessageId,
                      usage: {
                        promptTokens: 0,
                        responseTokens: 0,
                        totalTokens: 0,
                      },
                      generationStats: {
                        timeToFirstTokenMs: 0,
                        totalDurationMs: Date.now() - startedAt,
                        tokensPerSecond: 0,
                      },
                    },
                  );
                  await fetchAuthMutation(
                    api.functions.threads.internal_completeStream,
                    {
                      secret: env.INTERNAL_CONVEX_SECRET,
                      userId: requestUserId,
                      threadId,
                      assistantMessageId,
                      parts,
                    },
                  );

                  try {
                    await fetchAuthAction(
                      api.functions.billing.recordUsageEvent,
                      {
                        secret: env.INTERNAL_CONVEX_SECRET,
                        requestId: assistantMessageId,
                        messageId: assistantMessageId,
                        threadId,
                        routeId: imageModel.route.id,
                        usage: {
                          inputTokens: 0,
                          outputTokens: 0,
                          reasoningTokens: undefined,
                          cacheReadTokens: undefined,
                          cacheWriteTokens: undefined,
                          inputAudioTokens: undefined,
                          outputAudioTokens: undefined,
                        },
                        toolCalls: [
                          {
                            billingKey: "image_generation",
                            invocationCount: 1,
                          },
                        ],
                      },
                    );
                  } catch (billingError) {
                    console.error(
                      "Failed to record image generation billing event",
                      billingError,
                    );
                  }
                } finally {
                  await cleanupTools?.();
                }
              },
            });

            return createUIMessageStreamResponse({
              stream,
              consumeSseStream: async ({ stream }) => {
                const streamId = generateId();
                const { publisher, subscriber } = createUpstashPubSub();
                const streamContext = createResumableStreamContext({
                  waitUntil,
                  publisher,
                  subscriber,
                });
                await streamContext.createNewResumableStream(
                  streamId,
                  () => stream,
                );
                await fetchAuthMutation(
                  api.functions.threads.internal_setActiveStreamId,
                  {
                    secret: env.INTERNAL_CONVEX_SECRET,
                    userId: requestUserId,
                    threadId,
                    streamId,
                    messageId: assistantMessageId,
                    clientId,
                  },
                );
              },
            });
          }
          console.log("resolving model", settings.model);
          const resolvedModel = resolveAiSdkModel(settings.model);
          const reasoning = resolveReasoningParam(
            resolvedModel.route.supports.reasoning,
            resolvedModel.modelConfig.thinkingLevels,
            settings.thinkingLevel,
            resolvedModel.modelConfig.defaultThinkingLevel,
          );
          const runtimeProviderKey =
            resolvedModel.route.behavior.runtimeProviderKey ??
            resolvedModel.route.provider;
          const providerOptions = resolveProviderOptions(runtimeProviderKey);
          const messagesWithAttachments = await materializeAttachmentsForRoute(
            resolvedModel.route,
            messages,
            attachmentsByMessageId,
            {
              useBashUploadReferences: isBashWorkspaceEnabled,
            },
          );
          const sanitizedModelMessages = messagesWithAttachments.map(
            (message) =>
              message.role === "assistant"
                ? {
                    ...message,
                    parts: sanitizeAssistantPartsForPersistence(message.parts),
                  }
                : message,
          );

          // Convert to model messages format
          const modelMessages = await convertToModelMessages(
            sanitizedModelMessages,
          );

          const systemPrompt = [
            BASE_SYSTEM_PROMPT,
            selectedInstructionPrompt,
            projectInstructions,
            projectToolInstruction,
            projectContextBlock,
          ]
            .filter((prompt): prompt is string => Boolean(prompt))
            .join("\n\n");

          const abortController = new AbortController();
          console.log("abortController", abortController);
          await fetchAuthQuery(
            api.functions.threads.internal_validateGenerationMessage,
            {
              secret: env.INTERNAL_CONVEX_SECRET,
              userId: requestUserId,
              messageId: assistantMessageId,
              threadId,
            },
          );
          const checkMessageAbort = throttle(() => {
            void fetchAuthQuery(
              api.functions.threads.internal_checkMessageAbort,
              {
                secret: env.INTERNAL_CONVEX_SECRET,
                userId: requestUserId,
                messageId: assistantMessageId,
                threadId: threadId,
              },
            )
              .then((res) => {
                if (res) {
                  console.log("Stream aborted by user");
                  abortController.abort();
                }
              })
              .catch((error: unknown) => {
                console.error("Failed to check chat stream abort state", {
                  requestUserId,
                  assistantMessageId,
                  threadId,
                  error,
                });
                abortController.abort();
              });
          }, 1000);

          // Track generation timing stats
          const streamStartTime = Date.now();
          let firstTokenTime: number | null = null;
          let reasoningStartTime: number | null = null;
          let reasoningEndTime: number | null = null;

          const tracedModel = withPostHogTracing(
            resolvedModel.model,
            requestUserId,
          );
          const hasMcpApproval =
            Object.keys(toolRuntime.mcpToolApproval).length > 0;
          const result = streamText({
            model: tracedModel,
            system: systemPrompt,
            messages: modelMessages,
            ...(reasoning ? { reasoning } : {}),
            ...(providerOptions ? { providerOptions } : {}),
            abortSignal: abortController.signal,
            tools: toolRuntime.tools,
            ...(hasMcpApproval
              ? { toolApproval: toolRuntime.mcpToolApproval }
              : {}),
            experimental_transform: smoothStream({
              // this makes client md rendering way smoother and performant
              delayInMs: 20,
              chunking: "word",
            }),
            stopWhen: stepCountIs(20), // we need to tune this
            onError: ({ error }) => {
              console.error("Chat stream error", error);
            },
            onFinish: async ({ usage, finishReason }) => {
              if (finishReason === "content-filter") {
                streamRefused = true;
                await reportStreamFailure(
                  "The model refused to generate a response for this request.",
                );
              }
              try {
                const usageData =
                  usage.inputTokens !== undefined &&
                  usage.outputTokens !== undefined &&
                  usage.totalTokens !== undefined
                    ? {
                        promptTokens: usage.inputTokens,
                        responseTokens: usage.outputTokens,
                        totalTokens: usage.totalTokens,
                      }
                    : undefined;

                // Calculate generation stats
                const totalDurationMs = Date.now() - streamStartTime;
                const timeToFirstTokenMs = firstTokenTime
                  ? firstTokenTime - streamStartTime
                  : totalDurationMs;
                const reasoningDurationMs =
                  reasoningStartTime && reasoningEndTime
                    ? Math.max(0, reasoningEndTime - reasoningStartTime)
                    : undefined;
                const outputTokens = usage.outputTokens ?? 0;
                const tokensPerSecond =
                  totalDurationMs > 0
                    ? (outputTokens / totalDurationMs) * 1000
                    : 0;

                const generationStats = {
                  ...(reasoningDurationMs !== undefined
                    ? { reasoningDurationMs }
                    : {}),
                  timeToFirstTokenMs,
                  totalDurationMs,
                  tokensPerSecond,
                };

                // Save the completed response to Convex
                await fetchAuthMutation(
                  api.functions.threads.internal_updateMessageUsage,
                  {
                    secret: env.INTERNAL_CONVEX_SECRET,
                    userId: requestUserId,
                    threadId,
                    messageId: assistantMessageId,
                    usage: usageData ?? {
                      promptTokens: 0,
                      responseTokens: 0,
                      totalTokens: 0,
                    },
                    generationStats,
                  },
                );

                getPostHogClient()?.capture({
                  distinctId: requestUserId,
                  event: "chat_stream_completed",
                  properties: {
                    model: settings.model,
                    trigger: parsedBody.trigger,
                    input_tokens: usage.inputTokens,
                    output_tokens: usage.outputTokens,
                    total_tokens: usage.totalTokens,
                    time_to_first_token_ms: generationStats.timeToFirstTokenMs,
                    total_duration_ms: generationStats.totalDurationMs,
                    tokens_per_second: generationStats.tokensPerSecond,
                  },
                });

                try {
                  await fetchAuthAction(
                    api.functions.billing.recordUsageEvent,
                    {
                      secret: env.INTERNAL_CONVEX_SECRET,
                      requestId: assistantMessageId,
                      messageId: assistantMessageId,
                      threadId,
                      routeId: resolvedModel.route.id,
                      usage: {
                        inputTokens: usage.inputTokens,
                        outputTokens: usage.outputTokens,
                        reasoningTokens:
                          usage.outputTokenDetails.reasoningTokens,
                        cacheReadTokens:
                          usage.inputTokenDetails.cacheReadTokens,
                        cacheWriteTokens:
                          usage.inputTokenDetails.cacheWriteTokens,
                        inputAudioTokens: undefined,
                        outputAudioTokens: undefined,
                      },
                      toolCalls: toolRuntime.getBillableToolCalls(),
                    },
                  );
                } catch (billingError) {
                  console.error(
                    "Failed to record usage billing event",
                    billingError,
                  );
                }
              } finally {
                await cleanupTools?.();
              }
            },
            onChunk: ({ chunk }) => {
              // Track time to first token
              firstTokenTime ??= Date.now();
              if (chunk.type === "reasoning-delta") {
                reasoningStartTime ??= firstTokenTime;
                reasoningEndTime = Date.now();
              }
              checkMessageAbort();
            },
            onAbort: () => {
              console.log("Stream aborted");
              void cleanupTools?.();
            },
          });

          console.log("stream started");
          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            sendReasoning: true,
            sendSources: true,
            generateMessageId: () => assistantMessageId,
            onError: (error) => {
              const errorMessage = getErrorMessage(error).slice(0, 1000);
              lastStreamErrorMessage = errorMessage;
              void cleanupTools?.();
              return errorMessage;
            },
            messageMetadata: ({ part }) => {
              if (part.type === "start") {
                return { createdAt: Date.now() };
              }
            },
            onFinish: async ({ messages: finishedMessages }) => {
              if (streamRefused) {
                await cleanupTools?.();
                return;
              }

              if (lastStreamErrorMessage) {
                await reportStreamFailure(lastStreamErrorMessage);
                await cleanupTools?.();
                return;
              }

              const last = finishedMessages[finishedMessages.length - 1];
              const parts = last?.parts ?? [];
              const persistedParts =
                sanitizeAssistantPartsForPersistence(parts);
              if (!parts.some(isPersistableAssistantPart)) {
                await reportStreamFailure(
                  lastStreamErrorMessage ?? "Chat stream failed",
                );
                await cleanupTools?.();
                return;
              }

              await fetchAuthMutation(
                api.functions.threads.internal_completeStream,
                {
                  secret: env.INTERNAL_CONVEX_SECRET,
                  userId: requestUserId,
                  threadId: threadId,
                  assistantMessageId: assistantMessageId,
                  parts: persistedParts,
                },
              );
            },
            consumeSseStream: async ({ stream }) => {
              const streamId = generateId();
              const { publisher, subscriber } = createUpstashPubSub();
              const streamContext = createResumableStreamContext({
                waitUntil,
                publisher,
                subscriber,
              });
              await streamContext.createNewResumableStream(
                streamId,
                () => stream,
              );

              console.log("Setting activeStreamId with clientId:", clientId);
              await fetchAuthMutation(
                api.functions.threads.internal_setActiveStreamId,
                {
                  secret: env.INTERNAL_CONVEX_SECRET,
                  userId: requestUserId,
                  threadId: threadId,
                  streamId,
                  messageId: assistantMessageId,
                  clientId,
                },
              );
            },
          });
        } catch (error) {
          console.error("Chat route failed", error);
          await cleanupTools?.();
          await reportStreamFailure(error);
          throw error;
        }
      },
    },
  },
});
