import { createContext, use } from "react";

interface ReasoningContextValue {
  duration?: number;
  isOpen: boolean;
  isStreaming: boolean;
}

const ReasoningContext = createContext<ReasoningContextValue | null>(null);

function useReasoningContext() {
  const context = use(ReasoningContext);

  if (!context) {
    throw new Error("Reasoning components must be used within <Reasoning />.");
  }

  return context;
}

export { ReasoningContext, useReasoningContext };
export type { ReasoningContextValue };
