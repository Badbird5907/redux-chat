import type { TextPart, UIMessage } from "ai";

interface SubmitMessageParams {
  messageContent: string;
  threadId: string | undefined;
  setThreadId: (id: string) => void;
  selectedModel: string;
  clientId: string;
  fileIds?: string[];
  safeGetSignedId: (
    count: number,
  ) => Promise<({ id: string; str: string } | undefined)[]>;
  createMessage: (args: {
    threadId: string;
    userMessage: { parts: TextPart[] };
    userMessageId: string;
    assistantMessageId: string;
    model: string;
  }) => Promise<{
    threadId: string;
    userMessageId: string;
    assistantMessageId: string;
  }>;
  setOptimisticMessage: (message: UIMessage) => void;
  sendMessage: (
    message: { text: string; id?: string; metadata?: Record<string, unknown> },
    options?: { body?: object },
  ) => void;
  convexMessages: UIMessage[];
}

export async function submitMessage({
  messageContent,
  threadId,
  setThreadId,
  selectedModel,
  clientId,
  fileIds = [],
  safeGetSignedId,
  createMessage,
  setOptimisticMessage,
  sendMessage,
  convexMessages,
}: SubmitMessageParams): Promise<void> {
  const start = performance.now();

  const messagePart: { parts: TextPart[] } = {
    parts: [
      {
        type: "text",
        text: messageContent,
      },
    ],
  };

  let threadInfo:
    | { threadId: string; userMessageId: string; assistantMessageId: string }
    | undefined;

  if (threadId) {
    // Existing thread: get 2 signed IDs (user message, assistant message)
    const [userMessageId, assistantMessageId] = await safeGetSignedId(2);
    if (!userMessageId || !assistantMessageId) {
      throw new Error("Failed to get message IDs");
    }

    threadInfo = await createMessage({
      threadId: threadId,
      userMessage: messagePart,
      userMessageId: userMessageId.str,
      assistantMessageId: assistantMessageId.str,
      model: selectedModel,
    });
  } else {
    // New thread: get 3 signed IDs (user message, assistant message, thread id)
    const [userMessageId, assistantMessageId, threadIdSigned] =
      await safeGetSignedId(3);
    if (!userMessageId || !assistantMessageId || !threadIdSigned) {
      throw new Error("Failed to get IDs");
    }

    // Set threadId BEFORE calling mutation
    setThreadId(threadIdSigned.id);

    setOptimisticMessage({
      id: userMessageId.id,
      role: "user",
      parts: [{ type: "text", text: messageContent }],
    });

    console.log(
      "new thread",
      userMessageId,
      assistantMessageId,
      threadIdSigned,
    );
    threadInfo = await createMessage({
      threadId: threadIdSigned.str,
      userMessage: messagePart,
      userMessageId: userMessageId.str,
      assistantMessageId: assistantMessageId.str,
      model: selectedModel,
    });
  }

  // Build messages array from Convex with only necessary fields
  const messagesForAPI = convexMessages.map((m) => ({
    id: m.id,
    role: m.role,
    parts: m.parts,
  }));

  // Add the new user message
  messagesForAPI.push({
    id: threadInfo.userMessageId,
    role: "user" as const,
    parts: [{ type: "text" as const, text: messageContent }],
  });

  const body = {
    threadId: threadInfo.threadId,
    assistantMessageId: threadInfo.assistantMessageId,
    messages: messagesForAPI,
    fileIds,
    model: selectedModel,
    id: threadInfo.threadId,
    clientId,
    trigger: "submit-message" as const,
  };

  console.log("Starting stream now");
  console.log("Sending clientId:", clientId);

  // sendMessage - pass user message ID so it matches our optimistic message
  // The assistant message ID is passed in the body for the streaming response
  void sendMessage(
    {
      id: threadInfo.userMessageId,
      text: messageContent,
      metadata: {
        assistantMessageId: threadInfo.assistantMessageId,
      },
    },
    {
      body,
    },
  );

  const end = performance.now();
  console.log("Time taken to send message", end - start);
}
