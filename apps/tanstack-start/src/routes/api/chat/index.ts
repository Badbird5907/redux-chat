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

const requestBody = z.object({
  fileIds: z.array(z.string()),
  threadId: z.string(),
  id: z.string(), // this is a generated id by the client
  model: z.string(),
  trigger: z.enum(["submit-message", "edit-message", "regenerate-message"]),
  clientId: z.string().optional(), // client session ID to identify the initiating client
  // For submit-message and edit-message:
  userMessageId: z.string().optional(),
  // For regenerate-message (from SDK's regenerate function):
  messageId: z.string().optional(),
  // For edit-message and regenerate-message (existing flow):
  assistantMessageId: z.string().optional(),
});

export const Route = createFileRoute("/api/chat/")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsedBody = requestBody.parse(await request.json());

        const {
          threadId,
          userMessageId,
          id,
          clientId,
          trigger,
          assistantMessageId,
          messageId,
        } = parsedBody;
        console.log("client generated id", id);
        console.log({ threadId, userMessageId, trigger, messageId });
        console.log("Received clientId:", clientId);

        // Handle regenerate-message trigger - create new sibling assistant message
        let userMessageIdToUse = userMessageId;
        let assistantMessageIdToUse = assistantMessageId;

        if (trigger === "regenerate-message" && messageId) {
          // messageId is the assistant message to regenerate
          // Create a new assistant message as sibling
          const regenerateResult = await fetchAuthMutation(
            api.functions.threads.internal_createRegenerateSibling,
            {
              secret: env.INTERNAL_CONVEX_SECRET,
              threadId,
              originalAssistantMessageId: messageId,
            },
          );

          userMessageIdToUse = regenerateResult.userMessageId;
          assistantMessageIdToUse = regenerateResult.assistantMessageId;
        }

        // Ensure we have a userMessageId
        if (!userMessageIdToUse) {
          throw new Error("userMessageId is required");
        }

        // For regeneration, pass the assistantMessageId to use the existing message
        const messagesData = await fetchAuthMutation(
          api.functions.threads.internal_prepareStream,
          {
            threadId: threadId,
            userMessageId: userMessageIdToUse,
            secret: env.INTERNAL_CONVEX_SECRET,
            // Pass assistantMessageId if we have one (from regenerate or edit flow)
            ...(assistantMessageIdToUse
              ? { assistantMessageId: assistantMessageIdToUse }
              : {}),
          },
        ); // returns the chat history up to the assistant message

        console.log("===== got messages data =====", messagesData);

        // Convert to model messages format (exclude the placeholder assistant message)
        const modelMessages = await convertToModelMessages(
          messagesData.conversationHistory,
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
          model: openai(messagesData.settings.model),
          messages: modelMessages,
          temperature: messagesData.settings.temperature,
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
                messageId: messagesData.assistantMessage.messageId,
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
                  messageId: messagesData.assistantMessage.messageId,
                },
              ).then((res) => {
                if (res) {
                  abortController.abort();
                  return;
                }
              });
            }, 1000);
          },
        });
        console.log("stream started");
        return result.toUIMessageStreamResponse({
          originalMessages: messagesData.conversationHistory,
          generateMessageId: () => messagesData.assistantMessage.messageId,
          messageMetadata: ({ part }) => {
            if (part.type === "start") {
              return { createdAt: Date.now() };
            }
          },
          onFinish: async ({ messages }) => {
            const last = messages[messages.length - 1];
            const parts = last?.parts ?? [];
            await fetchAuthMutation(
              api.functions.threads.internal_completeStream,
              {
                secret: env.INTERNAL_CONVEX_SECRET,
                threadId: threadId,
                assistantMessageId: messagesData.assistantMessage.messageId,
                parts,
              },
            );
          },
          consumeSseStream: async ({ stream }) => {
            const streamId = generateId();
            const streamContext = createResumableStreamContext({
              waitUntil,
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
