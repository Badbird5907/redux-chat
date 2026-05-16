"use client";

import type { UIMessage } from "ai";
import { isReasoningUIPart, isToolUIPart } from "ai";

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
import { AnalysisDetailsButton } from "@/components/chat/tools/analysis";
import { StreamingMarkdown } from "@/components/markdown/streaming-markdown";
import {
  getAssistantStepIcon,
  getChainOfThoughtHeaderState,
} from "./assistant-message-helpers";
import { normalizeAssistantMessage } from "./assistant-message-timeline";
import type { MessageStats } from "./chat-types";

export function AssistantMessageParts({
  isLastMessage,
  isStreaming,
  message,
  messageStats,
}: {
  isLastMessage: boolean;
  isStreaming: boolean;
  message: UIMessage;
  messageStats?: MessageStats;
}) {
  const { reasoningText, steps, textContent } =
    normalizeAssistantMessage(message);
  const hasTimelineReasoning = steps.some((step) => step.kind === "reasoning");
  const isReasoningStreaming =
    isStreaming && message.parts.at(-1)?.type === "reasoning";
  const hasActiveOrErroredStep = steps.some(
    (step) => step.status === "active" || step.status === "error",
  );
  const hasActiveMessagePart = message.parts.some((part) => {
    if (isReasoningUIPart(part)) {
      return part.state === "streaming";
    }

    if (isToolUIPart(part)) {
      return (
        part.state === "input-streaming" ||
        part.state === "input-available" ||
        part.state === "approval-requested" ||
        part.state === "approval-responded"
      );
    }

    return false;
  });
  const isChainActive =
    isLastMessage &&
    steps.length > 0 &&
    (isStreaming || hasActiveMessagePart || textContent.trim().length === 0);
  const defaultChainOpen =
    isLastMessage &&
    steps.length > 0 &&
    (isChainActive || hasActiveOrErroredStep);
  const headerState = getChainOfThoughtHeaderState(steps);
  const activeStepId =
    [...steps].reverse().find((step) => step.status === "active")?.id ??
    [...steps].reverse().find((step) => step.status === "pending")?.id ??
    (isChainActive ? steps.at(-1)?.id : undefined);
  const activeStep = steps.find((step) => step.id === activeStepId);
  const headerIcon =
    isChainActive && activeStep
      ? getAssistantStepIcon(activeStep)
      : headerState.icon;
  const headerLabel =
    isChainActive && activeStep
      ? (activeStep.summary ?? activeStep.label)
      : headerState.label;
  const headerStatus = isChainActive ? "active" : headerState.status;

  return (
    <>
      {reasoningText && !hasTimelineReasoning ? (
        <Reasoning
          className="mb-3"
          defaultOpen={isReasoningStreaming}
          duration={messageStats?.generationStats?.reasoningDurationMs}
          isStreaming={isReasoningStreaming}
          key={`${message.id}:reasoning:${isReasoningStreaming ? "streaming" : "done"}`}
        >
          <ReasoningTrigger />
          <ReasoningContent>
            <StreamingMarkdown
              content={reasoningText}
              isStreaming={isReasoningStreaming}
              reasoning
            />
          </ReasoningContent>
        </Reasoning>
      ) : null}

      {steps.length > 0 ? (
        <ChainOfThought
          className="mb-3"
          defaultOpen={defaultChainOpen}
          key={`${message.id}:chain`}
        >
          <ChainOfThoughtHeader
            icon={headerIcon}
            shimmer={isChainActive || headerStatus === "active"}
            status={headerStatus}
          >
            {headerLabel}
          </ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {steps.map((step) => (
              <ChainOfThoughtStep
                description={step.description}
                icon={getAssistantStepIcon(step)}
                key={step.id}
                label={step.label}
                shimmer={step.id === activeStepId}
                status={step.id === activeStepId ? "active" : step.status}
              >
                {step.kind === "reasoning" && step.content ? (
                  <div className="border-border/80 text-muted-foreground max-h-48 overflow-y-auto border-l pr-2 pl-4 text-sm">
                    <StreamingMarkdown
                      content={step.content}
                      isStreaming={step.status === "active"}
                      reasoning
                    />
                  </div>
                ) : null}

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

                {step.analysisDetails ? (
                  <AnalysisDetailsButton
                    details={step.analysisDetails}
                    status={step.status}
                  />
                ) : null}
              </ChainOfThoughtStep>
            ))}
          </ChainOfThoughtContent>
        </ChainOfThought>
      ) : null}

      {textContent ? (
        <StreamingMarkdown content={textContent} isStreaming={isStreaming} />
      ) : null}
    </>
  );
}

export { getAssistantStepIcon } from "./assistant-message-helpers";
