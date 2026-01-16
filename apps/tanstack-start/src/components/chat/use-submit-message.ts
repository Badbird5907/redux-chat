import type { TextPart, UIMessage } from "ai";

interface SubmitMessageParams {
  messageContent: string;
  threadId: string | undefined;
  setThreadId: (id: string) => void;
  selectedModel: string;
  clientId: string;
  fileIds?: string[];
  parentMessageId?: string; // Last message in the current branch path
  safeGetSignedId: (
    count: number,
  ) => Promise<({ id: string; str: string } | undefined)[]>;
  createMessage: (args: {
    threadId: string;
    message: { parts: TextPart[] };
    messageId: string;
    parentMessageId?: string;
  }) => Promise<{ threadId: string; messageId: string }>;
  setOptimisticMessage: (message: UIMessage | undefined) => void;
  sendMessage: (
    message: { text: string; id?: string; metadata?: Record<string, unknown> },
    options?: { body?: object },
  ) => void;
}

export async function submitMessage({
  messageContent,
  threadId,
  setThreadId,
  selectedModel,
  clientId,
  fileIds = [],
  parentMessageId,
  safeGetSignedId,
  createMessage,
  setOptimisticMessage,
  sendMessage,
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

  let threadInfo: { threadId: string; messageId: string } | undefined;

  if (threadId) {
    const [messageId] = await safeGetSignedId(1);
    if (!messageId) throw new Error("Failed to get messageId");
    setOptimisticMessage({
      id: messageId.id,
      role: "user",
      parts: [
        {
          type: "text",
          text: messageContent,
        },
      ],
    });
    threadInfo = await createMessage({
      threadId: threadId,
      message: messagePart,
      messageId: messageId.str,
      parentMessageId,
    });
  } else {
    // new thread
    const [messageId, newThreadId] = await safeGetSignedId(2);
    if (!messageId || !newThreadId)
      throw new Error("Failed to get messageId or threadId");
    setOptimisticMessage({
      id: messageId.id,
      role: "user",
      parts: [
        {
          type: "text",
          text: messageContent,
        },
      ],
    });
    console.log("new thread", messageId, newThreadId);
    setThreadId(newThreadId.id);
    threadInfo = await createMessage({
      threadId: newThreadId.str, // tell the backend to generate a new thread using the signed message
      message: messagePart,
      messageId: messageId.str,
      // No parentMessageId for first message
    });
  }

  const body = {
    threadId: threadInfo.threadId,
    userMessageId: threadInfo.messageId,
    fileIds,
    model: selectedModel,
    id: threadInfo.threadId,
    clientId, // Client session ID to identify the initiating client
    trigger: "submit-message" as const,
  };

  console.log("Starting stream now");
  console.log("Sending clientId:", clientId);

  // sendMessage adds user message and handles streaming
  void sendMessage(
    {
      id: threadInfo.messageId,
      text: messageContent,
      metadata: {
        tempReduxMessageId: threadInfo.messageId,
      },
    },
    {
      body,
    },
  );

  const end = performance.now();
  console.log("Time taken to send message", end - start);
}
