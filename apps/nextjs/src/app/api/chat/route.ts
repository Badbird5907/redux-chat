import { generateId, streamText, convertToModelMessages } from "ai";
import { openai } from "@ai-sdk/openai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream/generic";

import { fetchAuthMutation, fetchAuthQuery } from "@/auth/server";
import { api } from "@redux/backend/convex/_generated/api";
import type { Id } from "@redux/backend/convex/_generated/dataModel";
import { env } from "@/env";
import { createPubSub } from "./stream";

interface RequestBody {
  message: { text: string };
  threadId?: string;
  trigger: "submit-message" | "regenerate-message";
}

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;
  const { message, threadId: existingThreadId, trigger } = body;

  let threadId: Id<"threads">;
  let assistantMessageId: Id<"messages">;

  // Create new thread or add message to existing one
  if (!existingThreadId) {
    // New chat - create thread with initial message
    const result = await fetchAuthMutation(api.functions.threads.createThread, {
      message: message.text,
    });
    threadId = result.threadId;
    assistantMessageId = result.assistantMessageId;
  } else {
    // Existing chat - add message
    threadId = existingThreadId as Id<"threads">;

    if (trigger === "submit-message") {
      const result = await fetchAuthMutation(api.functions.threads.addMessage, {
        threadId,
        message: message.text,
      });
      assistantMessageId = result.assistantMessageId;
    } else {
      // For regeneration, we'd need different logic - for now treat as submit
      const result = await fetchAuthMutation(api.functions.threads.addMessage, {
        threadId,
        message: message.text,
      });
      assistantMessageId = result.assistantMessageId;
    }
  }

  // Fetch the full message history for context
  const messagesData = await fetchAuthQuery(
    api.functions.threads.getThreadMessages,
    { threadId }
  );

  // Convert to model messages format (exclude the placeholder assistant message)
  const modelMessages = await convertToModelMessages(
    messagesData
      .filter((m) => m.content)
      .map((m) => ({
        id: m.id,
        role: m.role,
        parts: [{ type: "text" as const, text: m.content }],
      }))
  );

  // Stream the response
  const result = streamText({
    model: openai("gpt-4o-mini"),
    messages: modelMessages,
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
      await fetchAuthMutation(api.functions.threads.completeStream, {
        secret: env.INTERNAL_CONVEX_SECRET,
        threadId,
        assistantMessageId,
        content: text,
        usage: usageData,
      });
    },
  });

  // Convert to UI message stream
  const uiStream = result.toUIMessageStreamResponse({
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
      
      await fetchAuthMutation(api.functions.threads.setActiveStreamId, {
        secret: env.INTERNAL_CONVEX_SECRET,
        threadId,
        streamId,
      });
    },
  });

  return uiStream;
}
