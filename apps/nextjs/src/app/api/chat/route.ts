import { generateId, streamText, convertToModelMessages } from "ai";
import { openai } from "@ai-sdk/openai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";

import { fetchAuthMutation, fetchAuthQuery } from "@/auth/server";
import { api } from "@redux/backend/convex/_generated/api";
import { env } from "@/env";
import { throttle } from "@/lib/utils/throttle";
import { z } from "zod";

const requestBody= z.object({
  fileIds: z.array(z.string()),
  threadId: z.string(),
  id: z.string(), // this is a generated id by the client
  model: z.string(),
  assistantMessageId: z.string(),
  userMessageId: z.string(),
  trigger: z.enum(["submit-message", "regenerate-message"]),
})
export async function POST(request: Request) {
  const parsedBody = requestBody.parse(await request.json());

  const { threadId, userMessageId, assistantMessageId, id } = parsedBody;
  console.log("client generated id", id);
  const messagesData = await fetchAuthQuery(
    api.functions.threads.internal_prepareStream,
    {
      threadId: threadId,
      userMessageId: userMessageId,
      assistantMessageId: assistantMessageId,
      secret: env.INTERNAL_CONVEX_SECRET,
    }
  ); // returns the chat history up to the assistant message

  console.log("===== got messages data =====", messagesData);

  // Convert to model messages format (exclude the placeholder assistant message)
  // Convert to model messages format (exclude the placeholder assistant message)
  const modelMessages = await convertToModelMessages(
    messagesData.conversationHistory
      .filter((m) => m.content) // Filter out empty messages (like the placeholder assistant message)
      .map((m) => {
        let parts;
        if (typeof m.content === 'string') {
          parts = [{ type: "text" as const, text: m.content }];
        } else if (Array.isArray(m.content)) {
          parts = m.content;
        } else {
          parts = [{ type: "text" as const, text: "" }]; // Fallback/Error case
        }
        return {
          id: m.id,
          role: m.role,
          parts: parts,
        };
      })
  );
  console.log("modelMessages")
  console.dir(modelMessages, { depth: Infinity })
  console.log("------------")

  const abortController = new AbortController();
  const result = streamText({
    model: openai(messagesData.settings.model),
    messages: modelMessages,
    temperature: messagesData.settings.temperature,
    abortSignal: abortController.signal,
    // _internal: {
    //   generateId: () => {
    //     console.log("generateId called")
    //     return assistantMessageId
    //   },
    // },
    onFinish: async ({ response, usage }) => {
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

      // Save the completed response to Convex
      // We use response.messages to get the actual messages generated, which includes reasoning parts etc.
      await fetchAuthMutation(api.functions.threads.internal_completeStream, {
        secret: env.INTERNAL_CONVEX_SECRET,
        threadId: threadId,
        assistantMessageId: assistantMessageId,
        content: response.messages.length > 0 ? response.messages[response.messages.length - 1]?.content ?? "" : "", // Get the last message content which is the assistant response
        usage: usageData,
      });
    },
    onChunk: () => {
      throttle(() => {
        // we want to prevent the stream from freezing. It is extremely unlikely that this query will take more than 1 second.
        void (fetchAuthQuery(api.functions.threads.internal_checkMessageAbort, {
          secret: env.INTERNAL_CONVEX_SECRET,
          messageId: assistantMessageId,
        })).then(res => {
          if (res) {
            abortController.abort();
            return;
          }
        });
      }, 1000)
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messagesData.conversationHistory.map((m) => {
      let parts;
      if (typeof m.content === 'string') {
        parts = [{ type: "text" as const, text: m.content }];
      } else if (Array.isArray(m.content)) {
        parts = m.content;
      } else {
        parts = [{ type: "text" as const, text: "" }];
      }
      return {
        id: m.id,
        role: m.role,
        parts: parts,
      };
    }),
    generateMessageId: () => assistantMessageId,
    messageMetadata: ({ part }) => {
      if (part.type === "start") {
        return { createdAt: Date.now() };
      }
    },
    consumeSseStream: async ({ stream }) => {
      const streamId = generateId();
      // Create a resumable stream context
      const streamContext = createResumableStreamContext({
        waitUntil: after,
        // ...createPubSub(),
      });
      await streamContext.createNewResumableStream(streamId, () => stream);
      
      await fetchAuthMutation(api.functions.threads.internal_setActiveStreamId, {
        secret: env.INTERNAL_CONVEX_SECRET,
        threadId: threadId,
        streamId,
      });
    },
  });
}
