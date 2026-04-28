import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { openai } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import {
  convertToModelMessages,
  generateId,
  smoothStream,
  stepCountIs,
  streamText,
} from "ai";
import { createResumableStreamContext } from "resumable-stream";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";
import {
  getChatModelConfig,
  isToolEnabled,
  normalizeMessageSettings,
} from "@redux/types";

import { env } from "@/env";
import { createToolRuntime } from "@/lib/ai/tools";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { buildAttachmentUrl } from "@/lib/silo/core.server";
import { retrieveProjectContext } from "@/server/rag/retrieve";
import type { RetrievedChunk } from "@/server/rag/vector-store";
import { createUpstashPubSub } from "@/lib/upstash-resumable-stream";
import { throttle } from "@/lib/utils/throttle";

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
    tools: z.object({
      search: z.object({}).optional(),
      analysisWorkspace: z
        .object({
          syncUploads: z.boolean().optional(),
        })
        .optional(),
    }),
  }),
  model: z.string(),
  id: z.string(),
  trigger: z.enum(["submit-message", "regenerate-message"]),
  clientId: z.string().optional(),
});

type ChatRequestMessage = z.infer<typeof requestBody>["messages"][number];

const ENABLE_PROJECT_RAG_PREFETCH = false; // do we eagerly retrieve project context?
// maybe sell under "smarter projects"

interface ModelAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  url: string;
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

  return Promise.all(
    attachments
      .filter((attachment) => !attachment.expired)
      .map(
        async (attachment): Promise<ModelAttachment> => ({
          attachmentId: attachment.attachmentId,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          url: await buildAttachmentUrl({
            accessKey: attachment.accessKey,
            fileName: attachment.fileName,
            mimeType: attachment.mimeType,
            isPublic: attachment.isPublic,
            serveImage: attachment.serveImage,
          }),
        }),
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
    .map((part) => {
      if (
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        part &&
        typeof part === "object" &&
        "type" in part &&
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string"
      ) {
        return part.text;
      }
      return "";
    })
    .filter(Boolean)
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
    "Cite them inline using their tags (e.g. [#cite-1]) when you use them. " +
    "If a chunk's content is not relevant, ignore it.";

  const blocks = chunks.map((chunk, index) => {
    const tag = `[#cite-${index + 1}]`;
    const locator =
      chunk.modality === "pdf_page" && chunk.pageNumber !== undefined
        ? `file: ${chunk.fileName}, page ${chunk.pageNumber}`
        : `file: ${chunk.fileName}`;
    const body =
      chunk.modality === "image"
        ? "(image — refer to it by file name when relevant)"
        : (chunk.text ?? "(no text)");
    return `${tag} ${locator}\n${body}`;
  });

  return [header, "", ...blocks].join("\n\n");
}

function mergeAttachments(
  existing: ModelAttachment[] | undefined,
  incoming: ModelAttachment[],
) {
  const mergedById = new Map(
    existing?.map(
      (attachment) => [attachment.attachmentId, attachment] as const,
    ),
  );

  for (const attachment of incoming) {
    mergedById.set(attachment.attachmentId, attachment);
  }

  return Array.from(mergedById.values());
}

function modelSupportsProjectMedia(modelId: string, mimeType: string) {
  const config = getChatModelConfig(modelId);
  if (!config) {
    return false;
  }

  if (mimeType === "application/pdf") {
    return config.allowedMimeTypes.includes("pdf");
  }

  if (mimeType.startsWith("image/")) {
    return config.allowedMimeTypes.includes("image");
  }

  return false;
}

function getProjectMediaAttachmentIds(
  chunks: RetrievedChunk[],
  modelId: string,
): string[] {
  const attachmentIds: string[] = [];
  const seen = new Set<string>();

  for (const chunk of chunks) {
    if (chunk.text?.trim()) {
      continue;
    }
    if (!modelSupportsProjectMedia(modelId, chunk.mimeType)) {
      continue;
    }
    if (seen.has(chunk.attachmentId)) {
      continue;
    }

    seen.add(chunk.attachmentId);
    attachmentIds.push(chunk.attachmentId);

    if (attachmentIds.length >= 2) {
      break;
    }
  }

  return attachmentIds;
}

function appendAttachmentParts(
  messages: ChatRequestMessage[],
  attachmentsByMessageId: Map<string, ModelAttachment[]>,
) {
  if (attachmentsByMessageId.size === 0) {
    return messages;
  }

  return messages.map((message) => {
    if (message.role !== "user") {
      return message;
    }

    const attachments = attachmentsByMessageId.get(message.id);
    if (!attachments?.length) {
      return message;
    }

    return {
      ...message,
      parts: [
        ...message.parts,
        ...attachments.map((attachment) => ({
          type: "file" as const,
          mediaType: attachment.mimeType,
          url: attachment.url,
          filename: attachment.fileName,
        })),
      ],
    };
  });
}

function getToolAttachments(
  attachmentsByMessageId: Map<string, ModelAttachment[]>,
) {
  return Array.from(
    new Map(
      Array.from(attachmentsByMessageId.values())
        .flat()
        .map((attachment) => [attachment.attachmentId, attachment] as const),
    ).values(),
  ).map((attachment) => ({
    attachmentId: attachment.attachmentId,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    url: attachment.url,
  }));
}

export const Route = createFileRoute("/api/chat/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
        console.log("Received request:", {
          threadId,
          assistantMessageId,
          clientId,
          model: settings.model,
          isSearchEnabled,
        });

        const attachmentsByMessageId =
          await getAttachmentsByMessageId(threadId);
        const lastUserMessageId = getLastUserMessageId(messages);

        // If this thread belongs to a Project, fetch its shared instructions
        // and prepend them as a system message to the model. Also retrieve
        // RAG context from the project's indexed file library.
        let projectInstructions: string | undefined;
        let projectContextBlock: string | undefined;
        let chatProjectId: string | undefined;
        let threadUserId: string | undefined;
        try {
          const thread = await fetchAuthQuery(
            api.functions.threads.getThread,
            { threadId },
          );
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
        } catch (error) {
          console.error("Failed to load project instructions", error);
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (chatProjectId && ENABLE_PROJECT_RAG_PREFETCH) {
          const queryText = extractTextFromMessage(getLastUserMessage(messages));
          if (queryText) {
            try {
              const { chunks } = await retrieveProjectContext({
                chatProjectId,
                query: queryText,
                k: 6,
              });
              if (chunks.length > 0) {
                projectContextBlock = formatChunksAsContext(chunks);

                if (lastUserMessageId) {
                  const projectMediaAttachmentIds = getProjectMediaAttachmentIds(
                    chunks,
                    settings.model,
                  );

                  if (projectMediaAttachmentIds.length > 0) {
                    attachmentsByMessageId.set(
                      lastUserMessageId,
                      mergeAttachments(
                        attachmentsByMessageId.get(lastUserMessageId),
                        await resolveModelAttachments(projectMediaAttachmentIds),
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

        if (lastUserMessageId && fileIds.length > 0) {
          attachmentsByMessageId.set(
            lastUserMessageId,
            mergeAttachments(
              attachmentsByMessageId.get(lastUserMessageId),
              await resolveModelAttachments(fileIds),
            ),
          );
        }

        const messagesWithAttachments = appendAttachmentParts(
          messages,
          attachmentsByMessageId,
        );
        const toolRuntime = createToolRuntime(settings, {
          attachments: getToolAttachments(attachmentsByMessageId),
          projectContext:
            chatProjectId && threadUserId
              ? {
                  chatProjectId,
                  userId: threadUserId,
                }
              : undefined,
        });
        let didCleanupTools = false;
        const cleanupTools = async () => {
          if (didCleanupTools) {
            return;
          }

          didCleanupTools = true;
          await toolRuntime.cleanup();
        };

        // Convert to model messages format
        const modelMessages = await convertToModelMessages(
          messagesWithAttachments,
        );

        // Prepend the project's shared instructions and any retrieved RAG
        // context as leading system messages. We do this on the model-message
        // array (after conversion) so they never get persisted on the thread.
        // Order: [projectInstructions, projectContext, ...userMessages]
        if (projectContextBlock) {
          modelMessages.unshift({
            role: "system",
            content: projectContextBlock,
          });
        }
        if (projectInstructions) {
          modelMessages.unshift({
            role: "system",
            content: projectInstructions,
          });
        }

        console.log("modelMessages");
        console.dir(modelMessages, { depth: Infinity });
        console.log("------------");

        const abortController = new AbortController();
        console.log("abortController", abortController);

        // Track generation timing stats
        const streamStartTime = Date.now();
        let firstTokenTime: number | null = null;

        const result = streamText({
          model: openai(settings.model),
          messages: modelMessages,
          abortSignal: abortController.signal,
          tools: toolRuntime.tools,
          experimental_transform: smoothStream({ // this makes client md rendering way smoother and performant
            delayInMs: 20,
            chunking: "word",
          }),
          stopWhen: stepCountIs(15),
          onFinish: async ({ usage }) => {
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
              const outputTokens = usage.outputTokens ?? 0;
              const tokensPerSecond =
                totalDurationMs > 0
                  ? (outputTokens / totalDurationMs) * 1000
                  : 0;

              const generationStats = {
                timeToFirstTokenMs,
                totalDurationMs,
                tokensPerSecond,
              };

              // Save the completed response to Convex
              await fetchAuthMutation(
                api.functions.threads.internal_updateMessageUsage,
                {
                  secret: env.INTERNAL_CONVEX_SECRET,
                  messageId: assistantMessageId,
                  usage: usageData ?? {
                    promptTokens: 0,
                    responseTokens: 0,
                    totalTokens: 0,
                  },
                  generationStats,
                },
              );
            } finally {
              await cleanupTools();
            }
          },
          onChunk: () => {
            // Track time to first token
            firstTokenTime ??= Date.now();
            throttle(() => {
              // we want to prevent the stream from freezing. It is extremely unlikely that this query will take more than 1 second.
              void fetchAuthQuery(
                api.functions.threads.internal_checkMessageAbort,
                {
                  secret: env.INTERNAL_CONVEX_SECRET,
                  messageId: assistantMessageId,
                },
              ).then((res) => {
                if (res) {
                  abortController.abort();
                  return;
                }
              });
            }, 1000);
          },
          onAbort: () => {
            console.log("Stream aborted");
            void cleanupTools();
          },
        });

        console.log("stream started");
        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          sendReasoning: true,
          sendSources: true,
          generateMessageId: () => assistantMessageId,
          messageMetadata: ({ part }) => {
            if (part.type === "start") {
              return { createdAt: Date.now() };
            }
          },
          onFinish: async ({ messages: finishedMessages }) => {
            const last = finishedMessages[finishedMessages.length - 1];
            const parts = last?.parts ?? [];
            await fetchAuthMutation(
              api.functions.threads.internal_completeStream,
              {
                secret: env.INTERNAL_CONVEX_SECRET,
                threadId: threadId,
                assistantMessageId: assistantMessageId,
                parts,
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
                threadId: threadId,
                streamId,
                clientId,
              },
            );
          },
        });
      },
    },
  },
});
