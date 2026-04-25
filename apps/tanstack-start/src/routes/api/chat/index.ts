import { openai } from "@ai-sdk/openai";
import { createFileRoute } from "@tanstack/react-router";
import { waitUntil } from "@vercel/functions";
import { convertToModelMessages, generateId, streamText } from "ai";
import { createResumableStreamContext } from "resumable-stream";
import { z } from "zod";

import { api } from "@redux/backend/convex/_generated/api";

import { env } from "@/env";
import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth/server";
import { throttle } from "@/lib/utils/throttle";
import { createUpstashPubSub } from "@/lib/upstash-resumable-stream";

const requestBody = z.object({
  fileIds: z.array(z.string()),
  threadId: z.string(),
  assistantMessageId: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(["user", "assistant"]),
      parts: z.array(z.any()),
    }),
  ),
  model: z.string(),
  id: z.string(),
  trigger: z.enum(["submit-message", "regenerate-message"]),
  clientId: z.string().optional(),
});

export const Route = createFileRoute("/api/chat/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsedBody = requestBody.parse(await request.json());

        const { threadId, assistantMessageId, messages, clientId, model } =
          parsedBody;
        console.log("Received request:", {
          threadId,
          assistantMessageId,
          clientId,
          model,
        });

        // Convert to model messages format
        const modelMessages = await convertToModelMessages(messages);
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
          }
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
              subscriber
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
