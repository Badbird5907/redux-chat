"use client";

import type { UIMessage } from "ai";
import {
  BrainIcon,
  GlobeIcon,
  SearchIcon,
  WrenchIcon,
} from "lucide-react";
import { Streamdown } from "streamdown";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtSearchResult,
  ChainOfThoughtSearchResults,
  ChainOfThoughtStep,
} from "@/components/ai/chain-of-thought";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai/reasoning";

import {
  normalizeAssistantMessage,
} from "./assistant-message-timeline";
import type { AssistantTimelineStep } from "./assistant-message-timeline";

export function AssistantMessageParts({
  isLastMessage,
  isStreaming,
  message,
}: {
  isLastMessage: boolean;
  isStreaming: boolean;
  message: UIMessage;
}) {
  const { reasoningText, steps, textContent } = normalizeAssistantMessage(message);
  const isReasoningStreaming =
    isStreaming && message.parts.at(-1)?.type === "reasoning";
  const defaultChainOpen =
    isLastMessage &&
    steps.some((step) => step.status === "active" || step.status === "error");

  return (
    <>
      {reasoningText ? (
        <Reasoning
          className="mb-3"
          defaultOpen={isReasoningStreaming}
          isStreaming={isReasoningStreaming}
          key={`${message.id}:reasoning:${isReasoningStreaming ? "streaming" : "done"}`}
        >
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      ) : null}

      {steps.length > 0 ? (
        <ChainOfThought
          className="mb-3"
          defaultOpen={defaultChainOpen}
          key={`${message.id}:chain:${defaultChainOpen ? "open" : "closed"}`}
        >
          <ChainOfThoughtHeader />
          <ChainOfThoughtContent>
            {steps.map((step) => (
              <ChainOfThoughtStep
                description={step.description}
                icon={getAssistantStepIcon(step)}
                key={step.id}
                label={step.label}
                status={step.status as "active" | "complete" | "pending"}
              >
                {step.searchResults?.length ? (
                  <ChainOfThoughtSearchResults>
                    {step.searchResults.map((result) => (
                      <ChainOfThoughtSearchResult
                        href={result.url}
                        key={`${step.id}:${result.url}`}
                        rel="noreferrer"
                      >
                        {result.title}
                      </ChainOfThoughtSearchResult>
                    ))}
                  </ChainOfThoughtSearchResults>
                ) : null}
              </ChainOfThoughtStep>
            ))}
          </ChainOfThoughtContent>
        </ChainOfThought>
      ) : null}

      {textContent ? (
        <Streamdown mode={isStreaming ? "streaming" : "static"}>
          {textContent}
        </Streamdown>
      ) : null}
    </>
  );
}

export function getAssistantStepIcon(step: AssistantTimelineStep) {
  if (step.kind === "reasoning") {
    return BrainIcon;
  }

  if (step.kind === "source") {
    return GlobeIcon;
  }

  if (step.label.toLowerCase().includes("search")) {
    return SearchIcon;
  }

  return WrenchIcon;
}
