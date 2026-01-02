import { generateId, streamText, convertToModelMessages } from "ai";
import { openai } from "@ai-sdk/openai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream/generic";

import { fetchAuthMutation, fetchAuthQuery } from "@/auth/server";
import { api } from "@redux/backend/convex/_generated/api";
import { env } from "@/env";
import { createPubSub } from "./stream";
import { throttle } from "@/lib/utils/throttle";

interface RequestBody {
  message: { text: string };
  threadId?: string;
  trigger: "submit-message" | "regenerate-message";
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;

  

  // Convert to model messages format (exclude the placeholder assistant message)
  const modelMessages = await convertToModelMessages(
    messagesData
      .filter((m) => m.content)
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        parts: [{ type: "text" as const, text: m.content }],
      }))
  );

  const abortController = new AbortController();
  // Stream the response
  const result = streamText({
    model: openai("gpt-4o-mini"),
    messages: modelMessages,
    abortSignal: abortController.signal,
    onFinish: async ({ text, usage }) => {
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
      await fetchAuthMutation(api.functions.threads.internal_completeStream, {
        secret: env.INTERNAL_CONVEX_SECRET,
        threadId,
        assistantMessageId,
        content: text,
        usage: usageData,
      });
    },
    onChunk: throttle(async () => {
      const canceledAt = await fetchAuthQuery(api.functions.threads.internal_checkMessageAbort, {
        secret: env.INTERNAL_CONVEX_SECRET,
        messageId: assistantMessageId,
      });
      if (canceledAt) {
        abortController.abort();
        return;
      }
    }, 1000),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messagesData.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant" | "system",
      parts: [{ type: "text" as const, text: m.content }],
    })),
    headers: !existingThreadId ? { "X-Thread-Id": threadId } : undefined,
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
        ...createPubSub(),
      });
      await streamContext.createNewResumableStream(streamId, () => stream)
      
      await fetchAuthMutation(api.functions.threads.internal_setActiveStreamId, {
        secret: env.INTERNAL_CONVEX_SECRET,
        threadId,
        streamId,
      });
    },
  });
}
