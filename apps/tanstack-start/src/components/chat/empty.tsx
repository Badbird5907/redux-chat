import type { UIMessage } from "ai";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { toast } from "sonner";

import type { MessageSettings } from "@redux/types";
import { api } from "@redux/backend/convex/_generated/api";

import { useSignedCid } from "@/components/chat/client-id";
import { submitMessage } from "@/components/chat/use-submit-message";

interface SuggestionCardProps {
  text: string;
  onClick?: () => void;
}

const SuggestionCard = ({ text, onClick }: SuggestionCardProps) => {
  return (
    <button
      onClick={onClick}
      className="border-border bg-card hover:bg-muted/50 text-foreground rounded-xl border px-4 py-3 text-left text-sm transition-colors"
    >
      {text}
    </button>
  );
};

interface EmptyChatProps {
  threadId: string | undefined;
  chatProjectId?: string;
  setThreadId: (id: string) => void;
  sendMessage: (
    message: { text: string; id?: string; metadata?: Record<string, unknown> },
    options?: { body?: object },
  ) => void;
  setOptimisticMessage: (message: UIMessage | undefined) => void;
  clientId: string;
  convexMessages: UIMessage[];
  settings: MessageSettings;
}

const SUGGESTIONS = [
  "Explain quantum computing in simple terms",
  "Write a Python function to sort a list",
  "What are the latest trends in AI?",
  "Help me plan a project timeline",
  "Explain how React hooks work",
  "Write a professional email template",
];

function getTimeBasedGreeting() {
  const now = new Date();
  const hours = now.getHours();

  const morningGreetings = [
    "Good morning",
    "Rise and shine",
    "Morning! Ready to tackle the day?",
    "What's on the agenda today?",
    "Good morning! Let's make today great",
    "Morning! How can I help you today?",
  ];

  const afternoonGreetings = [
    "Good afternoon",
    "Afternoon! How's your day going?",
    "Good afternoon! What can I help with?",
    "Afternoon! Ready to dive in?",
    "Good afternoon! Let's get things done",
  ];

  const eveningGreetings = [
    "Good evening",
    "Evening! How was your day?",
    "Good evening! What's on your mind?",
    "Evening! Ready to chat?",
    "Good evening! How can I assist you?",
  ];

  const nightGreetings = [
    "Good evening",
    "Quiet hours, clear thoughts",
    "What can I help with tonight?",
    "Ready when you are",
  ];

  let greetings: string[];
  if (hours >= 5 && hours < 12) {
    greetings = morningGreetings;
  } else if (hours >= 12 && hours < 17) {
    greetings = afternoonGreetings;
  } else if (hours >= 17 && hours < 22) {
    greetings = eveningGreetings;
  } else {
    greetings = nightGreetings;
  }

  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) /
      1000 /
      60 /
      60 /
      24,
  );
  const selectionIndex = (hours + dayOfYear) % greetings.length;

  return greetings[selectionIndex] ?? greetings[0] ?? "Hello";
}

export const EmptyChat = ({
  threadId,
  chatProjectId,
  setThreadId,
  sendMessage,
  setOptimisticMessage,
  clientId,
  convexMessages,
  settings,
}: EmptyChatProps) => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { allocate: allocateSignedIds } = useSignedCid();
  const createMessage = useMutation(api.functions.threads.sendMessage);
  const [greeting, setGreeting] = useState("Hello");

  const handleSuggestionClick = async (text: string) => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated) {
      void navigate({ to: "/auth/sign-up" });
      return;
    }

    try {
      await submitMessage({
        messageContent: text,
        threadId,
        chatProjectId,
        setThreadId,
        settings,
        clientId,
        attachmentIds: [],
        allocateSignedIds,
        createMessage,
        setOptimisticMessage,
        sendMessage,
        convexMessages,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send message",
      );
      console.error("Failed to send message:", error);
    }
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setGreeting(getTimeBasedGreeting());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div className="flex h-full flex-col items-center px-4 pt-36 pb-36">
      <div className="flex flex-1 flex-col items-center justify-center">
        <h1 className="mb-8 text-center text-4xl font-bold">{greeting}</h1>

        <div className="grid w-full max-w-2xl grid-cols-1 gap-3 md:grid-cols-2">
          {SUGGESTIONS.map((text) => (
            <SuggestionCard
              key={text}
              text={text}
              onClick={() => void handleSuggestionClick(text)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
