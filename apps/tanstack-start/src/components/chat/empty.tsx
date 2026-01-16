import { useMemo } from "react";
import type { UIMessage } from "ai";
import { api } from "@redux/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { MODELS } from "@/lib/model-config"
import { useSignedCid } from "@/components/chat/client-id"
import { submitMessage } from "@/components/chat/use-submit-message"

interface SuggestionCardProps {
  text: string;
  onClick?: () => void;
}

const SuggestionCard = ({ text, onClick }: SuggestionCardProps) => {
  return (
    <button
      onClick={onClick}
      className="text-left px-4 py-3 rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors text-sm text-foreground"
    >
      {text}
    </button>
  );
};

interface EmptyChatProps {
  threadId: string | undefined;
  setThreadId: (id: string) => void;
  sendMessage: (message: { text: string, id?: string, metadata?: Record<string, unknown> }, options?: { body?: object }) => void;
  setOptimisticMessage: (message: UIMessage | undefined) => void;
  clientId: string;
}

const SUGGESTIONS = [
  "Explain quantum computing in simple terms",
  "Write a Python function to sort a list",
  "What are the latest trends in AI?",
  "Help me plan a project timeline",
  "Explain how React hooks work",
  "Write a professional email template",
];

export const EmptyChat = ({ threadId, setThreadId, sendMessage, setOptimisticMessage, clientId }: EmptyChatProps) => {
  const { safeGetSignedId } = useSignedCid();
  const createMessage = useMutation(api.functions.threads.sendMessage);
  const selectedModel = MODELS[0]?.id ?? "gpt-4o";

  const handleSuggestionClick = async (text: string) => {
    await submitMessage({
      messageContent: text,
      threadId,
      setThreadId,
      selectedModel,
      clientId,
      fileIds: [],
      safeGetSignedId,
      createMessage,
      setOptimisticMessage,
      sendMessage,
    });
  };

  const greeting = useMemo(() => {
    const now = new Date();
    const hours = now.getHours();

    // Define greetings for different time periods
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
      "Hello, night owl",
      "Still up? Let's chat",
      "Late night session? I'm here to help",
      "Good evening! Burning the midnight oil?",
      "Still up? How can I help you tonight?",
    ];

    // Select greetings based on time of day
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

    // Deterministically select a greeting based on hour and day
    // This ensures consistency while still providing variety throughout the day
    const dayOfYear = Math.floor(
      (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) /
        1000 /
        60 /
        60 /
        24
    );
    const selectionIndex = (hours + dayOfYear) % greetings.length;
    const selectedGreeting =
      greetings[selectionIndex] ?? (greetings[0] ?? "Hello");

    return selectedGreeting;
  }, []);

  return (
    <div className="flex h-full flex-col items-center px-4 pt-36 pb-36">
      <div className="flex flex-col items-center justify-center flex-1">
        <h1 className="text-4xl font-bold mb-8 text-center">{greeting}</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
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