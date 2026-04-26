import type { UIDataTypes, UIMessagePart, UITools } from "ai";
import { openai } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import { convertToModelMessages, generateId, streamText } from "ai";
import { createResumableStreamContext } from "resumable-stream";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { buildAttachmentUrl } from "@/lib/silo/core.server";
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
  model: z.string(),
  id: z.string(),
  trigger: z.enum(["submit-message", "regenerate-message"]),
  clientId: z.string().optional(),
});

type ChatRequestMessage = z.infer<typeof requestBody>["messages"][number];

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
          model,
        } = parsedBody;
        console.log("Received request:", {
          threadId,
          assistantMessageId,
          clientId,
          model,
        });

        const attachmentsByMessageId =
          await getAttachmentsByMessageId(threadId);
        const lastUserMessageId = getLastUserMessageId(messages);

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

        // Convert to model messages format
        const modelMessages = await convertToModelMessages(
          messagesWithAttachments,
        );
        console.log("modelMessages");
        console.dir(modelMessages, { depth: Infinity });
        console.log("------------");

        const abortController = new AbortController();
        console.log("abortController", abortController);

        // Track generation timing stats
        const streamStartTime = Date.now();
        let firstTokenTime: number | null = null;

        const result = streamText({
          model: openai(model),
          messages: modelMessages,
          abortSignal: abortController.signal,
          onFinish: async ({ usage }) => {
            // Get usage info if available (AI SDK v5/v6: inputTokens/outputTokens)
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
              totalDurationMs > 0 ? (outputTokens / totalDurationMs) * 1000 : 0;

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
          },
        });

        console.log("stream started");
        return result.toUIMessageStreamResponse({
          originalMessages: messages,
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
