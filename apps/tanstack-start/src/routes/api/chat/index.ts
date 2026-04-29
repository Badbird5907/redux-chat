import type { RetrievedChunk } from "@/server/rag/vector-store";
import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai";
import type { UIDataTypes, UIMessagePart, UITools } from "ai";
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
import { isToolEnabled, normalizeMessageSettings } from "@redux/types";

import { env } from "@/env";
import { createToolRuntime } from "@/lib/ai/tools";
import { formatProjectKnowledgeChunk } from "@/lib/ai/tools/project-knowledge-format";
import { selectProjectMediaAttachmentIds } from "@/lib/ai/tools/project-knowledge-media";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { buildAttachmentUrl } from "@/lib/silo/core.server";
import { createUpstashPubSub } from "@/lib/upstash-resumable-stream";
import { throttle } from "@/lib/utils/throttle";
import { resolveAiSdkModel } from "@/server/ai/model-runtime";
import { resolveServingAttachment } from "@/server/attachments-core/resolve-serving-attachment";
import { materializeAttachmentsForRoute } from "@/server/chat-attachments/materialize";
import { retrieveProjectContext } from "@/server/rag/retrieve";

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
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

type ChatRequestMessage = z.infer<typeof requestBody>["messages"][number];

const ENABLE_PROJECT_RAG_PREFETCH = false; // do we eagerly retrieve project context?
// maybe sell under "smarter projects"

interface ModelAttachment {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  accessKey: string;
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
    servingAttachments
      .filter((attachment) => !attachment.expired)
      .map(
        async (attachment): Promise<ModelAttachment> => ({
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
          isPublic: attachment.isPublic,
          serveImage: attachment.serveImage,
          projectId: attachment.projectId,
          environmentId: attachment.environmentId,
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
    return formatProjectKnowledgeChunk(chunk, {
      tag: `[#cite-${index + 1}]`,
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
      (attachment) => [attachment.attachmentId, attachment] as const,
    ),
  );

  for (const attachment of incoming) {
    mergedById.set(attachment.attachmentId, attachment);
  }

  return Array.from(mergedById.values());
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown chat stream error";
  }
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
          messageId,
          clientId,
          trigger,
          settings: rawSettings,
        } = parsedBody;
        const settings = normalizeMessageSettings(rawSettings);
        const isSearchEnabled = isToolEnabled(settings.tools, "search");
        console.log("Received request:", {
          threadId,
          assistantMessageId,
          clientId,
          trigger,
          messageId,
          model: settings.model,
          isSearchEnabled,
        });

        let cleanupTools: (() => Promise<void>) | undefined;
        const reportStreamFailure = async (error: unknown) => {
          const errorMessage = getErrorMessage(error).slice(0, 1000);
          try {
            await fetchAuthMutation(api.functions.threads.internal_failStream, {
              secret: env.INTERNAL_CONVEX_SECRET,
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
          let projectContextBlock: string | undefined;
          let projectToolInstruction: string | undefined;
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
          cleanupTools = async () => {
            if (didCleanupTools) {
              return;
            }

            didCleanupTools = true;
            await toolRuntime.cleanup();
          };

          const resolvedModel = resolveAiSdkModel(settings.model);
          const runtimeProviderKey =
            resolvedModel.route.behavior.runtimeProviderKey ??
            resolvedModel.route.provider;
          const providerOptions =
            runtimeProviderKey === "openai" &&
            resolvedModel.route.supports.reasoning
              ? {
                  openai: {
                    reasoningEffort: "medium", // TODO: we will set reasoning effort
                    reasoningSummary: "auto", // we want reasoning!!
                  } satisfies OpenAILanguageModelResponsesOptions,
                }
              : undefined;
          const messagesWithAttachments = await materializeAttachmentsForRoute(
            resolvedModel.route,
            messages,
            attachmentsByMessageId,
          );

          // Convert to model messages format
          const modelMessages = await convertToModelMessages(
            messagesWithAttachments,
          );

          // Prepend the project's shared instructions and any retrieved RAG
          // context as leading system messages. We do this on the model-message
          // array (after conversion) so they never get persisted on the thread.
          // Order: [projectInstructions, projectToolInstruction, projectContext, ...userMessages]
          if (projectContextBlock) {
            modelMessages.unshift({
              role: "system",
              content: projectContextBlock,
            });
          }
          if (projectToolInstruction) {
            modelMessages.unshift({
              role: "system",
              content: projectToolInstruction,
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
            model: resolvedModel.model,
            messages: modelMessages,
            providerOptions,
            abortSignal: abortController.signal,
            tools: toolRuntime.tools,
            experimental_transform: smoothStream({
              // this makes client md rendering way smoother and performant
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
                await cleanupTools?.();
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
                    threadId: threadId,
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
              void reportStreamFailure(error);
              void cleanupTools?.();
              return errorMessage;
            },
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
